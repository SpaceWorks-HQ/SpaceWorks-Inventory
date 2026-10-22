"use server";

import { z } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma } from "@/lib/db";
import { spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { DomainError } from "@/lib/domainError";
import { StockError } from "@/lib/inventory/availability";
import { canImport } from "@/lib/roles";
import { applyImportJob, IMPORT_KINDS, markImportFailed, MAX_IMPORT_BYTES, previewImport, recheckImport, type ImportStats } from "@/lib/importer";
import { loadSampleData } from "@/lib/sampleData";

const flag = z.union([z.boolean(), z.enum(["on", "true", "1", "false", "0", ""])]).optional().transform((v) => v === true || v === "on" || v === "true" || v === "1");
const optionsSchema = z.object({ createMissing: flag, updateExisting: flag });
const uploadSchema = optionsSchema.extend({
  kind: z.enum(IMPORT_KINDS, { message: "Choose what the file contains." }),
  file: z.instanceof(File, { message: "Choose a CSV or XLSX file." })
    .refine((file) => file.size > 0, "That file is empty.")
    .refine((file) => file.size <= MAX_IMPORT_BYTES, "Files can be at most 5 MB."),
});
const jobIdSchema = z.string().trim().min(1).max(64);
const APPLY_FAILED = "The import stopped and nothing was changed. Try again.";

const isRefusal = (error: unknown): error is Error => error instanceof DomainError || error instanceof StockError;

/** A business refusal becomes a UI-safe error; anything else is unexpected and rethrown. */
function refusal(error: unknown) {
  if (isRefusal(error)) return actionError(error.message);
  throw error;
}

/** Upload a CSV/XLSX file and check every row. Nothing changes until it is applied. */
export async function previewImportAction(slug: string, formData: FormData): Promise<ActionResult<{ jobId: string; stats: ImportStats }>> {
  const { ctx, denied } = await spaceAction(slug, canImport, "import");
  if (denied) return denied;
  const parsed = uploadSchema.safeParse({
    kind: formData.get("kind"),
    file: formData.get("file"),
    createMissing: formData.get("createMissing") ?? undefined,
    updateExisting: formData.get("updateExisting") ?? undefined,
  });
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { kind, file, createMissing, updateExisting } = parsed.data;
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await previewImport(ctx.space, { userId: ctx.user.id }, { kind, fileName: file.name || `${kind}.csv`, bytes, options: { createMissing, updateExisting } });
    revalidatePath(`/s/${ctx.space.slug}/import`);
    return { ok: true, data: result };
  } catch (error) {
    return refusal(error);
  }
}

/** Check a previewed import again with changed options. */
export async function recheckImportAction(slug: string, input: unknown): Promise<ActionResult<{ stats: ImportStats }>> {
  const { ctx, denied } = await spaceAction(slug, canImport);
  if (denied) return denied;
  const parsed = optionsSchema.extend({ jobId: jobIdSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { jobId, ...options } = parsed.data;
    const result = await recheckImport(ctx.space, { userId: ctx.user.id }, jobId, options);
    revalidatePath(`/s/${ctx.space.slug}/import`);
    return { ok: true, data: result };
  } catch (error) {
    return refusal(error);
  }
}

/** Apply the valid rows of a previewed import in one transaction. */
export async function applyImportAction(slug: string, jobId: unknown): Promise<ActionResult<ImportStats>> {
  // Uploads spend the "import" bucket; applying an already-checked file does not.
  const { ctx, denied } = await spaceAction(slug, canImport);
  if (denied) return denied;
  const parsed = jobIdSchema.safeParse(jobId);
  if (!parsed.success) return actionError("That import wasn't found.");
  const actor = { userId: ctx.user.id };
  try {
    const stats = await prisma.$transaction((tx) => applyImportJob(tx, ctx.space, parsed.data, actor), { timeout: 180_000, maxWait: 10_000 });
    revalidatePath(`/s/${ctx.space.slug}`, "layout");
    return { ok: true, data: stats };
  } catch (error) {
    if (isRefusal(error)) return actionError(error.message);
    await markImportFailed(ctx.space.id, parsed.data, actor);
    console.error("import.apply_failed", { jobId: parsed.data, error: error instanceof Error ? error.name : "unknown" });
    return actionError(APPLY_FAILED);
  }
}

/** Fill an empty space with a sample makerspace inventory. */
export async function loadSampleDataAction(slug: string): Promise<ActionResult<{ items: number; locations: number; assets: number }>> {
  const { ctx, denied } = await spaceAction(slug, canImport, "import");
  if (denied) return denied;
  try {
    const summary = await prisma.$transaction((tx) => loadSampleData(tx, ctx.space.id, ctx.user.id), { timeout: 120_000, maxWait: 10_000 });
    revalidatePath(`/s/${ctx.space.slug}`, "layout");
    return { ok: true, data: { items: summary.items, locations: summary.locations, assets: summary.assets } };
  } catch (error) {
    return refusal(error);
  }
}
