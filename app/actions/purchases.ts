"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { DomainError } from "@/lib/domainError";
import { parseMoneyToMinor } from "@/lib/format/money";
import { createPurchase, movePurchase, receivePurchase, type PurchasePayment } from "@/lib/purchases";
import { canAdjustStock, canViewStock } from "@/lib/roles";
import { idSchema } from "@/lib/validation";

/**
 * The buy list. Staff ask for things to be bought; inventory managers
 * approve, order, cancel and receive them into stock (lib/purchases).
 */

const optionalId = z.union([idSchema, z.literal(""), z.null()]).optional().transform((v) => v || null);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const moneyText = z.string().trim().max(20).optional().nullable().transform((v) => v || null);

function toMinor(value: string | null, currency: string): number | null | "invalid" {
  if (value === null) return null;
  const minor = parseMoneyToMinor(value, currency);
  return minor === null ? "invalid" : minor;
}

const COST_ERROR = "Enter the cost as a number, for example 249.50.";

/** What was spent when it was bought: required to mark a purchase ordered (or to receive one that skipped that step). */
const paymentSchema = z.object({
  amount: z.string().trim().min(1, "Enter the amount spent.").max(20),
  method: z.enum(["CASH", "BANK_TRANSFER", "UPI", "OTHER"]),
  reference: optionalText(120),
  supplierId: optionalId,
}).optional();

function toPayment(input: z.infer<typeof paymentSchema>, currency: string): PurchasePayment | undefined | "invalid" {
  if (!input) return undefined;
  const amountMinor = parseMoneyToMinor(input.amount, currency);
  if (amountMinor === null || amountMinor <= 0) return "invalid";
  return { amountMinor, method: input.method, reference: input.reference, supplierId: input.supplierId };
}

const AMOUNT_ERROR = "Enter the amount spent, for example 1249.50.";

function revalidate(slug: string) {
  revalidatePath(`/s/${slug}/purchases`);
  revalidatePath(`/s/${slug}/reports`);
  revalidatePath(`/s/${slug}/finance`);
}

const createSchema = z.object({
  itemId: optionalId,
  name: z.string().trim().max(120).default(""),
  quantity: z.number().int("Enter a whole number.").min(1, "Enter a quantity above zero.").max(100_000),
  supplierId: optionalId,
  unitCost: moneyText,
  link: optionalText(500),
  note: optionalText(1000),
});

export async function createPurchaseAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const { ctx, denied } = await spaceAction(slug, canViewStock);
  if (denied) return denied;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const unitCostMinor = toMinor(parsed.data.unitCost, ctx.space.currency);
  if (unitCostMinor === "invalid") return actionError(COST_ERROR, { unitCost: [COST_ERROR] });
  try {
    const purchase = await prisma.$transaction((tx) => createPurchase(tx, { spaceId: ctx.space.id, itemId: parsed.data.itemId, name: parsed.data.name, quantity: parsed.data.quantity, supplierId: parsed.data.supplierId, unitCostMinor, link: parsed.data.link, note: parsed.data.note }, { userId: ctx.user.id }));
    revalidate(ctx.space.slug);
    return { ok: true, data: { id: purchase.id } };
  } catch (error) {
    return domainFailure(error);
  }
}

/** "Add to buy list" from a reorder suggestion: the item's reorder quantity, else its reorder point. */
export async function addSuggestionAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canViewStock);
  if (denied) return denied;
  const parsed = z.object({ itemId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.item.findFirst({ where: { id: parsed.data.itemId, spaceId: ctx.space.id, archivedAt: null }, select: { name: true, reorderPoint: true, reorderQuantity: true, supplierId: true, unitCostMinor: true } });
      if (!item) throw new DomainError("That item wasn't found.", "not_found");
      const quantity = Math.max(1, item.reorderQuantity ?? item.reorderPoint ?? 1);
      await createPurchase(tx, { spaceId: ctx.space.id, itemId: parsed.data.itemId, name: item.name, quantity, supplierId: item.supplierId, unitCostMinor: item.unitCostMinor || null, link: null, note: null }, { userId: ctx.user.id });
    });
    revalidate(ctx.space.slug);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

const moveSchema = z.object({ purchaseId: idSchema, step: z.enum(["approve", "order", "cancel"]), payment: paymentSchema });

export async function movePurchaseAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canAdjustStock);
  if (denied) return denied;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const payment = toPayment(parsed.data.payment, ctx.space.currency);
  if (payment === "invalid") return actionError(AMOUNT_ERROR, { amount: [AMOUNT_ERROR] });
  try {
    await prisma.$transaction((tx) => movePurchase(tx, { spaceId: ctx.space.id, purchaseId: parsed.data.purchaseId, step: parsed.data.step, payment }, { userId: ctx.user.id }));
    revalidate(ctx.space.slug);
    return { ok: true };
  } catch (error) {
    return domainFailure(error);
  }
}

const receiveSchema = z.object({
  purchaseId: idSchema,
  locationId: idSchema,
  quantity: z.number().int("Enter a whole number.").min(1, "Enter how many arrived.").max(100_000),
  unitCost: moneyText,
  tracking: z.enum(["QUANTITY", "SERIALIZED"]).optional(),
  payment: paymentSchema,
});

export async function receivePurchaseAction(slug: string, input: unknown): Promise<ActionResult<{ itemId: string }>> {
  const { ctx, denied } = await spaceAction(slug, canAdjustStock);
  if (denied) return denied;
  const parsed = receiveSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const unitCostMinor = toMinor(parsed.data.unitCost, ctx.space.currency);
  if (unitCostMinor === "invalid") return actionError(COST_ERROR, { unitCost: [COST_ERROR] });
  const payment = toPayment(parsed.data.payment, ctx.space.currency);
  if (payment === "invalid") return actionError(AMOUNT_ERROR, { amount: [AMOUNT_ERROR] });
  try {
    const result = await prisma.$transaction((tx) => receivePurchase(tx, { spaceId: ctx.space.id, purchaseId: parsed.data.purchaseId, locationId: parsed.data.locationId, quantity: parsed.data.quantity, unitCostMinor, tracking: parsed.data.tracking, payment }, { userId: ctx.user.id }), { timeout: 30_000 });
    revalidate(ctx.space.slug);
    revalidatePath(`/s/${ctx.space.slug}/items`);
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}
