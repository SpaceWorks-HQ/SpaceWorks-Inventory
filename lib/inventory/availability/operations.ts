import "server-only";

import type { AdjustmentReason } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { assertPositiveQuantity, StockError, type Actor, type MovementRef } from "./errors";
import { applyLevelChange, availableOf, lockItems, lockLevels } from "./levels";
import { checkLowStock } from "./lowStock";

type Target = { spaceId: string; itemId: string; locationId: string };

async function quantityItem(tx: Tx, itemId: string) {
  const [item] = await lockItems(tx, [itemId]);
  if (!item) throw new StockError("That item no longer exists.", "invalid_quantity");
  if (item.tracking === "SERIALIZED") throw new StockError("Serialized items change stock one asset at a time.", "invalid_quantity");
  return item;
}

/** Weighted average cost after receiving `quantity` at `unitCostMinor`. */
export function nextAverageCost(previousAvg: number, previousQty: number, unitCostMinor: number, quantity: number) {
  const total = Math.max(previousQty, 0) + quantity;
  if (total <= 0) return unitCostMinor;
  return Math.round((previousAvg * Math.max(previousQty, 0) + unitCostMinor * quantity) / total);
}

/** Stock arrives (purchase, donation, import). Updates the average cost when a cost is given. */
export async function receiveStock(tx: Tx, target: Target & { quantity: number; unitCostMinor?: number | null; reason?: AdjustmentReason }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(target.quantity);
  const item = await quantityItem(tx, target.itemId);
  const levels = await lockLevels(tx, target.spaceId, [target]);
  if (target.unitCostMinor != null && target.unitCostMinor >= 0) {
    const [row] = await tx.$queryRaw<{ total: bigint | null }[]>`SELECT SUM("onHand") AS "total" FROM "StockLevel" WHERE "itemId" = ${target.itemId}`;
    const avg = nextAverageCost(item.avgCostMinor, Number(row?.total ?? 0), target.unitCostMinor, target.quantity);
    await tx.item.update({ where: { id: target.itemId }, data: { avgCostMinor: avg, unitCostMinor: target.unitCostMinor } });
  }
  const level = levels.get(`${target.itemId}:${target.locationId}`)!;
  await applyLevelChange(tx, level, { onHand: target.quantity, type: ref.refType === "Import" ? "IMPORT" : "RECEIPT", reason: target.reason ?? "RECEIVED", unitCostMinor: target.unitCostMinor ?? null }, actor, ref);
  await checkLowStock(tx, [target.itemId]);
  return level;
}

/**
 * Manual adjustment with a reason. A decrease may only take free stock:
 * held (reserved or quarantined) units must be released first.
 */
export async function adjustStock(tx: Tx, target: Target & { delta: number; reason: AdjustmentReason }, actor: Actor, ref: MovementRef = {}) {
  if (!Number.isSafeInteger(target.delta) || target.delta === 0) throw new StockError("Enter a change other than zero.", "invalid_quantity");
  await quantityItem(tx, target.itemId);
  const levels = await lockLevels(tx, target.spaceId, [target]);
  const level = levels.get(`${target.itemId}:${target.locationId}`)!;
  if (target.delta < 0 && availableOf(level) < -target.delta) throw new StockError(`Only ${availableOf(level)} free at this location.`);
  await applyLevelChange(tx, level, { onHand: target.delta, type: "ADJUSTMENT", reason: target.reason }, actor, ref);
  await checkLowStock(tx, [target.itemId]);
  return level;
}

/** Re-shelve free stock from one location to another in the same space. */
export async function moveStock(tx: Tx, input: { spaceId: string; itemId: string; fromLocationId: string; toLocationId: string; quantity: number }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(input.quantity);
  if (input.fromLocationId === input.toLocationId) throw new StockError("Choose a different location to move to.", "invalid_quantity");
  await quantityItem(tx, input.itemId);
  const levels = await lockLevels(tx, input.spaceId, [{ itemId: input.itemId, locationId: input.fromLocationId }, { itemId: input.itemId, locationId: input.toLocationId }]);
  const from = levels.get(`${input.itemId}:${input.fromLocationId}`)!;
  const to = levels.get(`${input.itemId}:${input.toLocationId}`)!;
  if (availableOf(from) < input.quantity) throw new StockError(`Only ${availableOf(from)} free at the source location.`);
  await applyLevelChange(tx, from, { onHand: -input.quantity, type: "MOVE" }, actor, ref);
  await applyLevelChange(tx, to, { onHand: input.quantity, type: "MOVE" }, actor, ref);
}

/** Put free units on the repair shelf (present but unusable). */
export async function quarantineStock(tx: Tx, target: Target & { quantity: number }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(target.quantity);
  await quantityItem(tx, target.itemId);
  const level = (await lockLevels(tx, target.spaceId, [target])).get(`${target.itemId}:${target.locationId}`)!;
  if (availableOf(level) < target.quantity) throw new StockError(`Only ${availableOf(level)} free at this location.`);
  await applyLevelChange(tx, level, { quarantined: target.quantity, type: "DAMAGE", reason: "DAMAGED" }, actor, ref);
  await checkLowStock(tx, [target.itemId]);
}

/** Repaired units go back to free stock; scrapped units leave the books. */
export async function resolveQuarantine(tx: Tx, target: Target & { quantity: number; outcome: "repair" | "scrap" }, actor: Actor, ref: MovementRef = {}) {
  assertPositiveQuantity(target.quantity);
  await quantityItem(tx, target.itemId);
  const level = (await lockLevels(tx, target.spaceId, [target])).get(`${target.itemId}:${target.locationId}`)!;
  if (level.quarantined < target.quantity) throw new StockError(`Only ${level.quarantined} on the repair shelf here.`);
  if (target.outcome === "repair") await applyLevelChange(tx, level, { quarantined: -target.quantity, type: "REPAIR" }, actor, ref);
  else await applyLevelChange(tx, level, { quarantined: -target.quantity, onHand: -target.quantity, type: "WRITE_OFF", reason: "DAMAGED" }, actor, ref);
  await checkLowStock(tx, [target.itemId]);
}
