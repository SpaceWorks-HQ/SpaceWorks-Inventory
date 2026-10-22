import "server-only";

import type { AdjustmentReason, MovementType, Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { StockError, type Actor, type MovementRef } from "./errors";

export type LevelKey = { itemId: string; locationId: string };
export type LockedLevel = { id: string; spaceId: string; itemId: string; locationId: string; onHand: number; reserved: number; quarantined: number };

/** Free to reserve, issue, move or consume. */
export function availableOf(level: Pick<LockedLevel, "onHand" | "reserved" | "quarantined">) {
  return level.onHand - level.reserved - level.quarantined;
}

/**
 * Lock catalogue rows in id order. Lock order across every flow:
 * loan or transfer row → Item rows → StockLevel rows → Asset rows.
 */
export async function lockItems(tx: Tx, itemIds: string[]) {
  const ids = [...new Set(itemIds)].sort();
  if (ids.length === 0) return [];
  return tx.$queryRaw<{ id: string; spaceId: string; tracking: string; avgCostMinor: number; reorderPoint: number | null; lowStockAlertAt: Date | null }[]>`
    SELECT "id", "spaceId", "tracking"::text AS "tracking", "avgCostMinor", "reorderPoint", "lowStockAlertAt"
    FROM "Item" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`;
}

/** Create missing balance rows, then lock every requested row in a stable order. */
export async function lockLevels(tx: Tx, spaceId: string, keys: LevelKey[]): Promise<Map<string, LockedLevel>> {
  const unique = [...new Map(keys.map((key) => [`${key.itemId}:${key.locationId}`, key])).values()]
    .sort((a, b) => (a.itemId === b.itemId ? a.locationId.localeCompare(b.locationId) : a.itemId.localeCompare(b.itemId)));
  for (const key of unique) {
    await tx.$executeRaw`
      INSERT INTO "StockLevel" ("id", "spaceId", "itemId", "locationId", "updatedAt")
      VALUES (${`sl_${key.itemId}_${key.locationId}`.slice(0, 120)}, ${spaceId}, ${key.itemId}, ${key.locationId}, now())
      ON CONFLICT ("itemId", "locationId") DO NOTHING`;
  }
  const result = new Map<string, LockedLevel>();
  for (const key of unique) {
    const [row] = await tx.$queryRaw<LockedLevel[]>`
      SELECT "id", "spaceId", "itemId", "locationId", "onHand", "reserved", "quarantined"
      FROM "StockLevel" WHERE "itemId" = ${key.itemId} AND "locationId" = ${key.locationId} FOR UPDATE`;
    if (!row || row.spaceId !== spaceId) throw new StockError("That stock belongs to another space.", "invalid_quantity");
    result.set(`${key.itemId}:${key.locationId}`, row);
  }
  return result;
}

export type LevelChange = {
  onHand?: number;
  reserved?: number;
  quarantined?: number;
  type: MovementType;
  reason?: AdjustmentReason | null;
  unitCostMinor?: number | null;
  assetId?: string | null;
};

/**
 * Apply signed deltas to one locked balance and append the ledger row. The
 * only writer of StockLevel. Refuses anything that would leave a negative
 * bucket or hold more than is on hand (the CHECK constraints back this up).
 */
export async function applyLevelChange(tx: Tx, level: LockedLevel, change: LevelChange, actor: Actor, ref: MovementRef = {}) {
  const onHand = level.onHand + (change.onHand ?? 0);
  const reserved = level.reserved + (change.reserved ?? 0);
  const quarantined = level.quarantined + (change.quarantined ?? 0);
  if (onHand < 0 || reserved < 0 || quarantined < 0 || reserved + quarantined > onHand) {
    throw new StockError("There isn't enough free stock at that location for this.");
  }
  await tx.stockLevel.update({ where: { id: level.id }, data: { onHand, reserved, quarantined } });
  level.onHand = onHand;
  level.reserved = reserved;
  level.quarantined = quarantined;
  const data: Prisma.StockMovementUncheckedCreateInput = {
    spaceId: level.spaceId,
    itemId: level.itemId,
    locationId: level.locationId,
    assetId: change.assetId ?? null,
    type: change.type,
    quantity: change.onHand ?? 0,
    reservedDelta: change.reserved ?? 0,
    quarantinedDelta: change.quarantined ?? 0,
    balanceAfter: onHand,
    unitCostMinor: change.unitCostMinor ?? null,
    reason: change.reason ?? null,
    note: ref.note?.slice(0, 500) ?? null,
    refType: ref.refType ?? null,
    refId: ref.refId ?? null,
    actorId: actor.userId ?? null,
    actorApiTokenId: actor.apiTokenId ?? null,
  };
  await tx.stockMovement.create({ data });
  return level;
}

/** Ledger row for a fact with no balance change (e.g. a unit lost while on loan). */
export async function recordLedgerOnly(tx: Tx, input: { spaceId: string; itemId: string; locationId?: string | null; assetId?: string | null; type: MovementType; unitCostMinor?: number | null; reason?: AdjustmentReason | null }, actor: Actor, ref: MovementRef = {}) {
  await tx.stockMovement.create({
    data: {
      spaceId: input.spaceId, itemId: input.itemId, locationId: input.locationId ?? null, assetId: input.assetId ?? null, type: input.type,
      unitCostMinor: input.unitCostMinor ?? null, reason: input.reason ?? null, note: ref.note?.slice(0, 500) ?? null,
      refType: ref.refType ?? null, refId: ref.refId ?? null, actorId: actor.userId ?? null, actorApiTokenId: actor.apiTokenId ?? null,
    },
  });
}
