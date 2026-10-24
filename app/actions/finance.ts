"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { createManualEntry, reverseFinanceEntry } from "@/lib/finance/post";
import { parseMoneyToMinor } from "@/lib/format/money";
import { startOfDay } from "@/lib/reports/range";
import { canManageFinance } from "@/lib/roles";
import { idSchema } from "@/lib/validation";

/** Manual ledger entries and reversals (inventory managers only; both audited). */

const manualSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  category: z.enum(["OTHER_INCOME", "RENT", "UTILITIES", "SUPPLIES", "OTHER_EXPENSE"]),
  amount: z.string().trim().min(1, "Enter the amount.").max(20),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]),
  reference: z.string().trim().max(120).optional().nullable().transform((v) => v || null),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the day."),
  note: z.string().trim().min(1, "Say what this money was for.").max(500),
});

function revalidate(slug: string) {
  revalidatePath(`/s/${slug}/finance`);
  revalidatePath(`/s/${slug}/reports`);
}

export async function createFinanceEntryAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageFinance);
  if (denied) return denied;
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const amountMinor = parseMoneyToMinor(parsed.data.amount, ctx.space.currency);
  if (amountMinor === null || amountMinor <= 0) return actionError("Enter the amount as a number, for example 2500.", { amount: ["Enter the amount as a number."] });
  try {
    await prisma.$transaction((tx) => createManualEntry(tx, { spaceId: ctx.space.id, direction: parsed.data.direction, category: parsed.data.category, amountMinor, method: parsed.data.method, reference: parsed.data.reference, occurredAt: startOfDay(parsed.data.occurredOn, ctx.space.timezone), note: parsed.data.note, actorId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true, data: null };
}

export async function reverseFinanceEntryAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, canManageFinance);
  if (denied) return denied;
  const parsed = z.object({ entryId: idSchema, reason: z.string().trim().min(1, "Say why this entry is reversed.").max(500) }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => reverseFinanceEntry(tx, { spaceId: ctx.space.id, entryId: parsed.data.entryId, reason: parsed.data.reason, actorId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true, data: null };
}
