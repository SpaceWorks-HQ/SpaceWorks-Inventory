"use server";

import { z, ZodError } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma, type Tx } from "@/lib/db";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { deleteCategory, deleteUnit, saveCategory, saveSupplier, saveUnit } from "@/lib/catalogue/taxonomy";
import { canDeleteSpace, canManageCatalogue, canManageSpace, hasRoleAtLeast } from "@/lib/roles";
import { isSettingsSection, SETTINGS_SECTIONS } from "@/lib/settings/sections";
import { replaceSpaceLogo } from "@/lib/setup/branding";
import { deleteSpace, saveSettingsSection, setSupplierArchived } from "@/lib/setup/settings";
import { deleteObjects, storeImage } from "@/lib/storage";
import { idSchema } from "@/lib/validation";

/**
 * Space settings. Space-manager sections and branding need ADMIN, the
 * inventory section and the taxonomy (categories, units, suppliers) need
 * MANAGER, deleting the space needs OWNER. Every change is audited.
 */

function revalidateSpace(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

export async function updateSettingsSection(slug: string, section: string, input: unknown): Promise<ActionResult> {
  if (!isSettingsSection(section)) return actionError("That settings section doesn't exist.");
  const config = SETTINGS_SECTIONS[section];
  const { ctx, denied } = await spaceAction(slug, (m) => m != null && hasRoleAtLeast(m.role, config.minRole));
  if (denied) return denied;
  const result = await saveSettingsSection(prisma, ctx.space, section, input, ctx.user.id);
  if (!result.ok) return actionError(result.error, result.fieldErrors);
  if (result.changed.length > 0) revalidateSpace(ctx.space.slug);
  return { ok: true };
}

/** Upload or replace the space logo (stored like item photos, square-ish, at most 512px). */
export async function uploadSpaceLogoAction(slug: string, formData: FormData): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace, "upload");
  if (denied) return denied;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return actionError("Choose an image to upload.");
  const stored = await storeImage({ spaceId: ctx.space.id, folder: "items", file, maxSide: 512, maxBytes: 5 * 1024 * 1024 });
  if (!stored.ok) return actionError(stored.error);
  let previousKey: string | null;
  try {
    ({ previousKey } = await replaceSpaceLogo(ctx.space.id, stored.image.storageKey, ctx.user.id));
  } catch (error) {
    await deleteObjects([stored.image.storageKey]).catch(() => undefined);
    return domainFailure(error);
  }
  if (previousKey) await deleteObjects([previousKey]).catch(() => undefined);
  revalidateSpace(ctx.space.slug);
  return { ok: true };
}

export async function removeSpaceLogoAction(slug: string): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace);
  if (denied) return denied;
  if (!ctx.space.logoKey) return { ok: true };
  try {
    const { previousKey } = await replaceSpaceLogo(ctx.space.id, null, ctx.user.id);
    if (previousKey) await deleteObjects([previousKey]).catch(() => undefined);
  } catch (error) {
    return domainFailure(error);
  }
  revalidateSpace(ctx.space.slug);
  return { ok: true };
}

/** Owners only, after typing the space address. Everything in the space is removed. */
export async function deleteSpaceAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canDeleteSpace);
  if (denied) return denied;
  const parsed = z.object({ confirm: z.string().trim() }).safeParse(input);
  if (!parsed.success || parsed.data.confirm !== ctx.space.slug) return actionError(`Type ${ctx.space.slug} to confirm.`);
  let storageKeys: string[];
  try {
    ({ storageKeys } = await deleteSpace(ctx.space.id, ctx.user.id));
  } catch (error) {
    return domainFailure(error);
  }
  await deleteObjects(storageKeys).catch(() => undefined);
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ---------- Categories, units and suppliers (inventory managers) ---------- */

async function taxonomy(slug: string, run: (tx: Tx, spaceId: string, actor: { userId: string }) => Promise<unknown>): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageCatalogue);
  if (denied) return denied;
  try {
    await prisma.$transaction((tx) => run(tx, ctx.space.id, { userId: ctx.user.id }));
  } catch (error) {
    if (error instanceof ZodError) return validationError(error);
    return domainFailure(error);
  }
  revalidatePath(`/s/${ctx.space.slug}/settings/inventory`);
  revalidatePath(`/s/${ctx.space.slug}/items`);
  return { ok: true };
}

const saveSchema = z.object({ id: idSchema.nullable(), values: z.record(z.string(), z.unknown()) });
const idInput = z.object({ id: idSchema });

function parseSave(input: unknown) {
  const parsed = saveSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

export async function saveCategoryAction(slug: string, input: unknown): Promise<ActionResult> {
  const data = parseSave(input);
  if (!data) return actionError("Check the category and try again.");
  return taxonomy(slug, (tx, spaceId, actor) => saveCategory(tx, spaceId, data.id, data.values, actor));
}

export async function deleteCategoryAction(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return actionError("That category wasn't found.");
  return taxonomy(slug, (tx, spaceId, actor) => deleteCategory(tx, spaceId, parsed.data.id, actor));
}

export async function saveUnitAction(slug: string, input: unknown): Promise<ActionResult> {
  const data = parseSave(input);
  if (!data) return actionError("Check the unit and try again.");
  return taxonomy(slug, (tx, spaceId, actor) => saveUnit(tx, spaceId, data.id, data.values, actor));
}

export async function deleteUnitAction(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = idInput.safeParse(input);
  if (!parsed.success) return actionError("That unit wasn't found.");
  return taxonomy(slug, (tx, spaceId, actor) => deleteUnit(tx, spaceId, parsed.data.id, actor));
}

export async function saveSupplierAction(slug: string, input: unknown): Promise<ActionResult> {
  const data = parseSave(input);
  if (!data) return actionError("Check the supplier and try again.");
  return taxonomy(slug, (tx, spaceId, actor) => saveSupplier(tx, spaceId, data.id, data.values, actor));
}

export async function setSupplierArchivedAction(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ id: idSchema, archived: z.boolean() }).safeParse(input);
  if (!parsed.success) return actionError("That supplier wasn't found.");
  return taxonomy(slug, (tx, spaceId, actor) => setSupplierArchived(tx, spaceId, parsed.data.id, parsed.data.archived, actor));
}
