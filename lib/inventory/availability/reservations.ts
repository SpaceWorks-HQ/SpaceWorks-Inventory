import "server-only";

import type { Tx } from "@/lib/db";
import { assertPositiveQuantity, StockError, type Actor, type MovementRef } from "./errors";
import { applyLevelChange, availableOf, lockItems, lockLevels, recordLedgerOnly } from "./levels";
import { checkLowStock } from "./lowStock";

export type HoldOwner = { loanLineId: string } | { transferLineId: string };

function ownerWhere(owner: HoldOwner) {
  return "loanLineId" in owner ? { loanLineId: owner.loanLineId } : { transferLineId: owner.transferLineId };
}

/**
 * Hold `quantity` of an item for an approved loan or transfer line. With no
 * location given, the hold is taken from the locations with the most free
 * stock first (split across several when needed).
 */
export async function reserve(tx: Tx, input: { spaceId: string; itemId: string; quantity: number; locationId?: string | null; owner: HoldOwner }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(input.quantity);
  await lockItems(tx, [input.itemId]);
  const candidates = input.locationId
    ? [{ locationId: input.locationId }]
    : await tx.stockLevel.findMany({ where: { itemId: input.itemId, spaceId: input.spaceId }, select: { locationId: true } });
  const levels = await lockLevels(tx, input.spaceId, candidates.map((c) => ({ itemId: input.itemId, locationId: c.locationId })));
  const ordered = [...levels.values()].sort((a, b) => availableOf(b) - availableOf(a));
  const free = ordered.reduce((sum, level) => sum + Math.max(availableOf(level), 0), 0);
  if (free < input.quantity) throw new StockError(`Only ${free} available to hold.`);
  let remaining = input.quantity;
  const holds: { locationId: string; quantity: number }[] = [];
  for (const level of ordered) {
    if (remaining === 0) break;
    const take = Math.min(availableOf(level), remaining);
    if (take <= 0) continue;
    await applyLevelChange(tx, level, { reserved: take, type: "RESERVE" }, actor, ref);
    await tx.stockReservation.create({ data: { spaceId: input.spaceId, itemId: input.itemId, locationId: level.locationId, quantity: take, ...ownerWhere(input.owner) } });
    holds.push({ locationId: level.locationId, quantity: take });
    remaining -= take;
  }
  await checkLowStock(tx, [input.itemId]);
  return holds;
}

/** Release every hold of a line (rejected, cancelled, or replaced at issue/dispatch). Returns what was released. */
export async function releaseHolds(tx: Tx, input: { spaceId: string; itemId: string; owner: HoldOwner }, actor: Actor, ref: MovementRef = {}) {
  const holds = await tx.stockReservation.findMany({ where: { spaceId: input.spaceId, itemId: input.itemId, ...ownerWhere(input.owner) } });
  if (holds.length === 0) return [];
  await lockItems(tx, [input.itemId]);
  const levels = await lockLevels(tx, input.spaceId, holds.map((h) => ({ itemId: h.itemId, locationId: h.locationId })));
  const byLocation = new Map<string, number>();
  for (const hold of holds) byLocation.set(hold.locationId, (byLocation.get(hold.locationId) ?? 0) + hold.quantity);
  for (const [locationId, quantity] of byLocation) {
    await applyLevelChange(tx, levels.get(`${input.itemId}:${locationId}`)!, { reserved: -quantity, type: "RELEASE" }, actor, ref);
  }
  await tx.stockReservation.deleteMany({ where: { id: { in: holds.map((h) => h.id) } } });
  await checkLowStock(tx, [input.itemId]);
  return [...byLocation].map(([locationId, quantity]) => ({ locationId, quantity }));
}

/**
 * Take quantity-tracked units out of stock against a line's holds (loan
 * issue, transfer dispatch). Holds are consumed location by location; any
 * hold left over is released. Returns where the units came from.
 */
export async function takeFromHolds(tx: Tx, input: { spaceId: string; itemId: string; quantity: number; owner: HoldOwner; type: "ISSUE" | "TRANSFER_OUT" }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(input.quantity);
  const holds = await tx.stockReservation.findMany({ where: { spaceId: input.spaceId, itemId: input.itemId, ...ownerWhere(input.owner) }, orderBy: { createdAt: "asc" } });
  const held = holds.reduce((sum, hold) => sum + hold.quantity, 0);
  if (held < input.quantity) throw new StockError(`Only ${held} held for this line; it can't take ${input.quantity}.`);
  await lockItems(tx, [input.itemId]);
  const levels = await lockLevels(tx, input.spaceId, holds.map((h) => ({ itemId: h.itemId, locationId: h.locationId })));
  let remaining = input.quantity;
  const taken: { locationId: string; quantity: number }[] = [];
  for (const hold of holds) {
    const level = levels.get(`${input.itemId}:${hold.locationId}`)!;
    const take = Math.min(hold.quantity, remaining);
    // Any part of the hold not taken is released in the same movement.
    await applyLevelChange(tx, level, { reserved: -hold.quantity, onHand: -take, type: take > 0 ? input.type : "RELEASE" }, actor, ref);
    if (take > 0) taken.push({ locationId: hold.locationId, quantity: take });
    remaining -= take;
  }
  await tx.stockReservation.deleteMany({ where: { id: { in: holds.map((h) => h.id) } } });
  await checkLowStock(tx, [input.itemId]);
  return taken;
}

/** Take free units with no hold (self-checkout, direct handout). */
export async function takeFree(tx: Tx, input: { spaceId: string; itemId: string; locationId: string; quantity: number; type: "ISSUE" }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(input.quantity);
  await lockItems(tx, [input.itemId]);
  const level = (await lockLevels(tx, input.spaceId, [input])).get(`${input.itemId}:${input.locationId}`)!;
  if (availableOf(level) < input.quantity) throw new StockError(`Only ${availableOf(level)} free at this location.`);
  await applyLevelChange(tx, level, { onHand: -input.quantity, type: input.type }, actor, ref);
  await checkLowStock(tx, [input.itemId]);
}

/** Units come back into stock; damaged ones go straight onto the repair shelf. */
export async function putBack(tx: Tx, input: { spaceId: string; itemId: string; locationId: string; good: number; damaged: number; type: "RETURN" | "TRANSFER_IN" | "TRANSFER_RETURN"; assetId?: string | null }, actor: Actor, ref: MovementRef = {}) {
  const total = input.good + input.damaged;
  if (!Number.isSafeInteger(total) || input.good < 0 || input.damaged < 0 || total === 0) throw new StockError("Nothing to put back.", "invalid_quantity");
  await lockItems(tx, [input.itemId]);
  const level = (await lockLevels(tx, input.spaceId, [input])).get(`${input.itemId}:${input.locationId}`)!;
  await applyLevelChange(tx, level, { onHand: total, quarantined: input.damaged, type: input.type, assetId: input.assetId ?? null }, actor, ref);
  await checkLowStock(tx, [input.itemId]);
}

/** Units lost while out on a loan or in transit: no balance changes (they already left), but the ledger records it. */
export async function recordLossWhileOut(tx: Tx, input: { spaceId: string; itemId: string; quantity: number; type: "LOSS" | "TRANSFER_LOSS"; locationId?: string | null }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(input.quantity);
  await recordLedgerOnly(tx, { spaceId: input.spaceId, itemId: input.itemId, locationId: input.locationId ?? null, type: input.type, reason: "LOST" }, actor, { ...ref, note: ref.note ?? `${input.quantity} lost` });
}
