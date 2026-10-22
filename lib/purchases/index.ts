import "server-only";

import type { PurchaseStatus } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError } from "@/lib/domainError";
import { createAssets } from "@/lib/catalogue/assets";
import { createItem } from "@/lib/catalogue/items";
import { availabilityFor, availabilityOf, receiveStock } from "@/lib/inventory/availability";

type Actor = { userId: string | null };

const NEXT: Record<"approve" | "order" | "cancel", { from: PurchaseStatus[]; to: PurchaseStatus }> = {
  approve: { from: ["REQUESTED"], to: "APPROVED" },
  order: { from: ["REQUESTED", "APPROVED"], to: "ORDERED" },
  cancel: { from: ["REQUESTED", "APPROVED", "ORDERED"], to: "CANCELLED" },
};

/** Anyone on staff can ask for something to be bought; it starts as REQUESTED. */
export async function createPurchase(tx: Tx, input: { spaceId: string; itemId: string | null; name: string; quantity: number; supplierId: string | null; unitCostMinor: number | null; link: string | null; note: string | null }, actor: Actor) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100_000) throw new DomainError("Enter a quantity above zero.", "invalid");
  let name = input.name.trim();
  if (input.itemId) {
    const item = await tx.item.findFirst({ where: { id: input.itemId, spaceId: input.spaceId }, select: { name: true } });
    if (!item) throw new DomainError("That item wasn't found.", "not_found");
    name ||= item.name;
  }
  if (!name) throw new DomainError("Say what to buy.", "invalid");
  if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, spaceId: input.spaceId }, select: { id: true } }))) throw new DomainError("That supplier wasn't found.", "not_found");
  if (input.link && !/^https?:\/\//.test(input.link)) throw new DomainError("Links start with https://.", "invalid");
  const purchase = await tx.purchaseItem.create({
    data: { spaceId: input.spaceId, number: await nextSpaceSequence(tx, input.spaceId, "purchase"), itemId: input.itemId, name: name.slice(0, 120), quantity: input.quantity, supplierId: input.supplierId, unitCostMinor: input.unitCostMinor, link: input.link?.slice(0, 500) ?? null, note: input.note?.slice(0, 1000) ?? null, requestedById: actor.userId },
  });
  await recordAuditEvent({ client: tx, action: "purchase.requested", spaceId: input.spaceId, actorId: actor.userId, targetType: "PurchaseItem", targetId: purchase.id, metadata: { quantity: input.quantity } });
  return purchase;
}

export async function movePurchase(tx: Tx, input: { spaceId: string; purchaseId: string; step: "approve" | "order" | "cancel" }, actor: Actor) {
  const rule = NEXT[input.step];
  const updated = await tx.purchaseItem.updateMany({
    where: { id: input.purchaseId, spaceId: input.spaceId, status: { in: rule.from } },
    data: { status: rule.to, ...(input.step === "approve" ? { approvedById: actor.userId } : {}), ...(input.step === "order" ? { orderedAt: new Date() } : {}) },
  });
  if (updated.count !== 1) throw new DomainError("That purchase can't move to that step now.", "conflict");
  await recordAuditEvent({ client: tx, action: `purchase.${rule.to.toLowerCase()}`, spaceId: input.spaceId, actorId: actor.userId, targetType: "PurchaseItem", targetId: input.purchaseId });
}

/**
 * Receive an ordered (or approved) purchase into stock: links or creates the
 * catalogue item, then receives through the availability module with the
 * purchase cost (serialized items get one asset per unit).
 */
export async function receivePurchase(tx: Tx, input: { spaceId: string; purchaseId: string; locationId: string; quantity: number | null; unitCostMinor: number | null; tracking?: "QUANTITY" | "SERIALIZED" }, actor: Actor) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "PurchaseItem" WHERE "id" = ${input.purchaseId} AND "spaceId" = ${input.spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That purchase wasn't found.", "not_found");
  const purchase = await tx.purchaseItem.findUniqueOrThrow({ where: { id: input.purchaseId } });
  if (purchase.status !== "ORDERED" && purchase.status !== "APPROVED") throw new DomainError("Only approved or ordered purchases can be received.", "conflict");
  const quantity = input.quantity ?? purchase.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new DomainError("Enter how many arrived.", "invalid");
  if (!(await tx.location.findFirst({ where: { id: input.locationId, spaceId: input.spaceId, archivedAt: null }, select: { id: true } }))) throw new DomainError("Choose where the stock goes.", "invalid");
  const cost = input.unitCostMinor ?? purchase.unitCostMinor ?? null;
  const itemId = purchase.itemId ?? (await createItem(tx, input.spaceId, { name: purchase.name, tracking: input.tracking ?? "QUANTITY", unitCostMinor: cost ?? 0, supplierId: purchase.supplierId ?? undefined }, actor)).id;
  const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: { tracking: true } });
  const ref = { refType: "PurchaseItem", refId: purchase.id };
  if (item.tracking === "SERIALIZED") await createAssets(tx, input.spaceId, { itemId, locationId: input.locationId, count: quantity, purchaseCostMinor: cost }, actor, ref);
  else await receiveStock(tx, { spaceId: input.spaceId, itemId, locationId: input.locationId, quantity, unitCostMinor: cost }, actor, ref);
  await tx.purchaseItem.update({ where: { id: purchase.id }, data: { status: "RECEIVED", itemId, receivedAt: new Date(), receivedById: actor.userId, receivedLocationId: input.locationId, quantity } });
  await recordAuditEvent({ client: tx, action: "purchase.received", spaceId: input.spaceId, actorId: actor.userId, targetType: "PurchaseItem", targetId: purchase.id, metadata: { quantity } });
  return { itemId };
}

/** Items at or below their reorder point, with what is already on order. */
export async function reorderSuggestions(spaceId: string) {
  const items = await prisma.item.findMany({ where: { spaceId, archivedAt: null, reorderPoint: { not: null } }, select: { id: true, name: true, sku: true, reorderPoint: true, reorderQuantity: true, supplier: { select: { name: true } } } });
  const totals = await availabilityFor(spaceId, items.map((i) => i.id));
  const open = await prisma.purchaseItem.groupBy({ by: ["itemId"], where: { spaceId, status: { in: ["REQUESTED", "APPROVED", "ORDERED"] }, itemId: { in: items.map((i) => i.id) } }, _sum: { quantity: true } });
  const onOrder = new Map(open.map((row) => [row.itemId, row._sum.quantity ?? 0]));
  return items
    .map((item) => ({ ...item, available: availabilityOf(totals, item.id).available, onOrder: onOrder.get(item.id) ?? 0 }))
    .filter((item) => item.available <= (item.reorderPoint ?? 0))
    .sort((a, b) => a.available - (a.reorderPoint ?? 0) - (b.available - (b.reorderPoint ?? 0)));
}
