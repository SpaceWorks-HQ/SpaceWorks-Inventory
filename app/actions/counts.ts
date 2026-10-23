"use server";

import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { canCountStock, canManageCounts } from "@/lib/roles";
import { addCountLineSchema, countIdSchema, recordCountSchema, refreshLineSchema, scanCountSchema, scheduleActiveSchema, scheduleSchema, startCountSchema } from "@/lib/desk/countSchemas";
import {
  addCountLineStep, countTransitionStep, recordCountStep, refreshCountLineStep, saveScheduleStep, scanCountStep, setScheduleActiveStep, startCountStep,
} from "@/lib/desk/countSteps";

function refresh(slug: string, countId?: string) {
  revalidatePath(`/s/${slug}/counts`);
  if (countId) revalidatePath(`/s/${slug}/counts/${countId}`);
}

/** Open a cycle count: snapshot what is on hand in the chosen scope. */
export async function startCountAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageCounts);
  if (denied) return denied;
  const parsed = startCountSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const count = await startCountStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug);
    return { ok: true, data: { id: count.id } };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Record (or correct) what was found for one line. */
export async function recordCountAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canCountStock);
  if (denied) return denied;
  const parsed = recordCountSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await recordCountStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug, parsed.data.countId);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Add an item found where the snapshot didn't expect it. */
export async function addCountLineAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canCountStock);
  if (denied) return denied;
  const parsed = addCountLineSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await addCountLineStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug, parsed.data.countId);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Count a serialized unit by scanning its asset tag at the current shelf. */
export async function scanCountAssetAction(slug: string, input: unknown): Promise<ActionResult<{ label: string }>> {
  const { ctx, denied } = await spaceAction(slug, canCountStock, "scan");
  if (denied) return denied;
  const parsed = scanCountSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await scanCountStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug, parsed.data.countId);
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Take a fresh snapshot of a stale line so it can be recounted. */
export async function refreshCountLineAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canCountStock);
  if (denied) return denied;
  const parsed = refreshLineSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await refreshCountLineStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug, parsed.data.countId);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

async function transition(slug: string, input: unknown, step: "submit" | "reopen" | "post" | "cancel"): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, step === "submit" ? canCountStock : canManageCounts);
  if (denied) return denied;
  const parsed = countIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await countTransitionStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, step, parsed.data.countId);
    if (step === "post") revalidatePath(`/s/${ctx.space.slug}`, "layout");
    refresh(ctx.space.slug, parsed.data.countId);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Counting is done: hand the count to a manager to post. */
export async function submitCountAction(slug: string, input: unknown): Promise<ActionResult> {
  return transition(slug, input, "submit");
}

/** Back to counting after a submit. */
export async function reopenCountAction(slug: string, input: unknown): Promise<ActionResult> {
  return transition(slug, input, "reopen");
}

/** Set stock to what was counted (four-eyes above the variance threshold). */
export async function postCountAction(slug: string, input: unknown): Promise<ActionResult> {
  return transition(slug, input, "post");
}

export async function cancelCountAction(slug: string, input: unknown): Promise<ActionResult> {
  return transition(slug, input, "cancel");
}

/** Create a repeating count schedule. */
export async function saveCountScheduleAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageCounts);
  if (denied) return denied;
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const id = await saveScheduleStep({ spaceId: ctx.space.id, actorId: ctx.user.id, timeZone: ctx.space.timezone }, parsed.data);
    refresh(ctx.space.slug);
    return { ok: true, data: { id } };
  } catch (error) {
    return domainFailure(error);
  }
}

/** Pause or resume a count schedule. */
export async function setCountScheduleActiveAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageCounts);
  if (denied) return denied;
  const parsed = scheduleActiveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await setScheduleActiveStep({ spaceId: ctx.space.id, actorId: ctx.user.id }, parsed.data);
    refresh(ctx.space.slug);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}
