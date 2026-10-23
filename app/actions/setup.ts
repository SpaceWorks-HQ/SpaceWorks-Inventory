"use server";

import { z } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma } from "@/lib/db";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { canManageSpace } from "@/lib/roles";
import { addCategories, addUnit, completeSetup, createLocationPlan } from "@/lib/setup/onboarding";

/**
 * Space setup wizard steps (admins). Space details, lending and fees go
 * through `updateSettingsSection`; invitations through the members actions.
 */

const plannedSchema = z.object({
  key: z.string().min(1).max(64),
  parentKey: z.string().min(1).max(64).nullable(),
  kind: z.enum(["BUILDING", "ROOM", "SHELF", "BIN"]),
  name: z.string().trim().min(1, "Every location needs a name.").max(80),
  code: z.string().trim().toUpperCase().min(1).max(24),
});
const planSchema = z.object({ rows: z.array(plannedSchema).min(1, "Add at least one location, or skip this step.").max(300) });

export async function saveLocationPlanAction(slug: string, input: unknown): Promise<ActionResult<{ created: number }>> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace);
  if (denied) return denied;
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => createLocationPlan(tx, ctx.space.id, parsed.data.rows, { userId: ctx.user.id }), { timeout: 60_000 });
    revalidatePath(`/s/${ctx.space.slug}`, "layout");
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}

const categoriesSchema = z.object({ names: z.array(z.string().trim().min(1).max(60, "Keep category names under 60 characters.")).min(1, "Pick or type at least one category.").max(50) });

export async function addCategoriesAction(slug: string, input: unknown): Promise<ActionResult<{ created: number }>> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace);
  if (denied) return denied;
  const parsed = categoriesSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await prisma.$transaction((tx) => addCategories(tx, ctx.space.id, parsed.data.names, { userId: ctx.user.id }));
    revalidatePath(`/s/${ctx.space.slug}`, "layout");
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}

const unitSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(30),
  symbol: z.string().trim().min(1, "Enter a symbol.").max(10),
});

export async function addUnitAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace);
  if (denied) return denied;
  const parsed = unitSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => addUnit(tx, ctx.space.id, parsed.data, { userId: ctx.user.id }));
    revalidatePath(`/s/${ctx.space.slug}`, "layout");
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

export async function finishSetupAction(slug: string): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageSpace);
  if (denied) return denied;
  await prisma.$transaction((tx) => completeSetup(tx, ctx.space.id, { userId: ctx.user.id }));
  revalidatePath(`/s/${ctx.space.slug}`, "layout");
  return { ok: true };
}
