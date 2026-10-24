import "server-only";

import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { resolveScan } from "@/lib/catalogue/resolve";

async function openCount(tx: Tx, spaceId: string, countId: string) {
  const [row] = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "StockCount" WHERE "id" = ${countId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That count wasn't found.", "not_found");
  if (row.status !== "IN_PROGRESS") throw new DomainError("This count is no longer open for counting.", "conflict");
}

/** Record (or correct) what a counter found for one line. */
export async function recordCountedQuantity(tx: Tx, input: { spaceId: string; countId: string; lineId: string; counted: number; note: string | null; actorId: string | null }) {
  await openCount(tx, input.spaceId, input.countId);
  if (!Number.isSafeInteger(input.counted) || input.counted < 0 || input.counted > 1_000_000) throw new DomainError("Enter a whole number of zero or more.", "invalid");
  const line = await tx.stockCountLine.findFirst({ where: { id: input.lineId, countId: input.countId }, select: { id: true, itemId: true, locationId: true, item: { select: { tracking: true } } } });
  if (!line) throw new DomainError("That line isn't on this count.", "not_found");
  if (line.item.tracking === "SERIALIZED") {
    const scanned = await tx.stockCountScan.count({ where: { countId: input.countId, locationId: line.locationId, asset: { itemId: line.itemId, spaceId: input.spaceId } } });
    if (input.counted !== scanned) throw new DomainError("Scan each tag found here, then record the number of tags scanned. Enter 0 if none were found.", "invalid");
  }
  await tx.stockCountLine.update({ where: { id: line.id }, data: { countedQty: input.counted, countedById: input.actorId, countedAt: new Date(), note: input.note?.slice(0, 300) ?? null } });
}

/** Add an item found at a location the snapshot didn't include. */
export async function addCountLine(tx: Tx, input: { spaceId: string; countId: string; itemId: string; locationId: string; counted: number; actorId: string | null }) {
  await openCount(tx, input.spaceId, input.countId);
  const [item, location] = await Promise.all([
    tx.item.findFirst({ where: { id: input.itemId, spaceId: input.spaceId, archivedAt: null }, select: { tracking: true } }),
    tx.location.findFirst({ where: { id: input.locationId, spaceId: input.spaceId, archivedAt: null }, select: { id: true } }),
  ]);
  if (!item || !location) throw new DomainError("That item or location wasn't found.", "not_found");
  const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } }, select: { onHand: true } });
  return tx.stockCountLine.upsert({
    where: { countId_itemId_locationId: { countId: input.countId, itemId: input.itemId, locationId: input.locationId } },
    create: { countId: input.countId, itemId: input.itemId, locationId: input.locationId, expectedQty: level?.onHand ?? 0, countedQty: item.tracking === "SERIALIZED" ? null : input.counted, countedById: input.actorId, countedAt: new Date() },
    update: item.tracking === "SERIALIZED" ? {} : { countedQty: input.counted, countedById: input.actorId, countedAt: new Date() },
  });
}

/** Serialized items are counted by scanning each asset tag at the shelf where it was found. */
export async function scanCountAsset(tx: Tx, input: { spaceId: string; countId: string; code: string; locationId: string; actorId: string | null }) {
  await openCount(tx, input.spaceId, input.countId);
  const resolved = await resolveScan(input.spaceId, input.code, tx);
  if (!resolved || resolved.kind !== "asset") throw new DomainError("Scan an asset tag from this space.", "invalid");
  if (!(await tx.location.findFirst({ where: { id: input.locationId, spaceId: input.spaceId, archivedAt: null }, select: { id: true } }))) throw new DomainError("Choose the shelf you're counting.", "invalid");
  const previous = await tx.stockCountScan.findUnique({ where: { countId_assetId: { countId: input.countId, assetId: resolved.id } }, select: { locationId: true } });
  await tx.stockCountScan.upsert({
    where: { countId_assetId: { countId: input.countId, assetId: resolved.id } },
    create: { countId: input.countId, assetId: resolved.id, locationId: input.locationId, scannedById: input.actorId },
    update: { locationId: input.locationId, scannedById: input.actorId },
  });
  const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: resolved.itemId, locationId: input.locationId } }, select: { onHand: true } });
  await tx.stockCountLine.upsert({
    where: { countId_itemId_locationId: { countId: input.countId, itemId: resolved.itemId, locationId: input.locationId } },
    create: { countId: input.countId, itemId: resolved.itemId, locationId: input.locationId, expectedQty: level?.onHand ?? 0 },
    update: {},
  });
  // A saved serialized total follows the scans (here and on the shelf the tag left),
  // so the submitted sheet shows exactly what posting applies.
  for (const locationId of new Set([input.locationId, previous?.locationId].filter((id): id is string => Boolean(id)))) {
    const scanned = await tx.stockCountScan.count({ where: { countId: input.countId, locationId, asset: { itemId: resolved.itemId } } });
    await tx.stockCountLine.updateMany({ where: { countId: input.countId, itemId: resolved.itemId, locationId, countedQty: { not: null } }, data: { countedQty: scanned } });
  }
  return resolved;
}
