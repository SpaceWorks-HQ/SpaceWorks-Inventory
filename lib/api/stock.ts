import "server-only";

import type { AdjustmentReason } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { adjustStock, availableOf, receiveStock } from "@/lib/inventory/availability";

/**
 * Stock writes for the API: the availability module changes the balance and
 * the ledger; this layer checks the item and location belong to the space,
 * then records the audit row and the `stock.adjusted` webhook event in the
 * same transaction.
 */
type Actor = { userId: string; apiTokenId: string };

async function assertTargets(tx: Tx, spaceId: string, itemId: string, locationId: string) {
  const [item, location] = await Promise.all([
    tx.item.findFirst({ where: { id: itemId, spaceId }, select: { id: true, tracking: true, archivedAt: true, sku: true } }),
    tx.location.findFirst({ where: { id: locationId, spaceId }, select: { id: true, archivedAt: true } }),
  ]);
  if (!item) notFound("item");
  if (!location) notFound("location");
  if (item.archivedAt) throw new DomainError("That item is archived. Restore it first.", "conflict");
  if (location.archivedAt) throw new DomainError("That location is archived. Choose another.", "conflict");
  if (item.tracking === "SERIALIZED") throw new DomainError("Serialized items change stock one asset at a time, which needs staff in the app.", "invalid");
  return item;
}

function balance(level: { itemId: string; locationId: string; onHand: number; reserved: number; quarantined: number }) {
  return { itemId: level.itemId, locationId: level.locationId, onHand: level.onHand, reserved: level.reserved, quarantined: level.quarantined, available: availableOf(level) };
}

export async function apiAdjustStock(tx: Tx, spaceId: string, input: { itemId: string; locationId: string; delta: number; reason: AdjustmentReason; note: string | null }, actor: Actor) {
  const item = await assertTargets(tx, spaceId, input.itemId, input.locationId);
  const level = await adjustStock(tx, { spaceId, itemId: input.itemId, locationId: input.locationId, delta: input.delta, reason: input.reason }, actor, { refType: "Adjustment", note: input.note });
  await recordAuditEvent({ client: tx, action: "stock.adjusted", spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId, targetType: "Item", targetId: input.itemId, metadata: { locationId: input.locationId, quantity: input.delta, reason: input.reason, via: "api" } });
  await emitEvent(tx, { spaceId, type: "stock.adjusted", data: { itemId: input.itemId, sku: item.sku, locationId: input.locationId, change: input.delta, reason: input.reason, onHand: level.onHand } });
  return balance(level);
}

export async function apiReceiveStock(tx: Tx, spaceId: string, input: { itemId: string; locationId: string; quantity: number; unitCostMinor: number | null; reason: AdjustmentReason; note: string | null }, actor: Actor) {
  const item = await assertTargets(tx, spaceId, input.itemId, input.locationId);
  const level = await receiveStock(tx, { spaceId, itemId: input.itemId, locationId: input.locationId, quantity: input.quantity, unitCostMinor: input.unitCostMinor, reason: input.reason }, actor, { refType: "Receipt", note: input.note });
  await recordAuditEvent({ client: tx, action: "stock.received", spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId, targetType: "Item", targetId: input.itemId, metadata: { locationId: input.locationId, quantity: input.quantity, reason: input.reason, via: "api" } });
  await emitEvent(tx, { spaceId, type: "stock.adjusted", data: { itemId: input.itemId, sku: item.sku, locationId: input.locationId, change: input.quantity, reason: input.reason, onHand: level.onHand } });
  return balance(level);
}
