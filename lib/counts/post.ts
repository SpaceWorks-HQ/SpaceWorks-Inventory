import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { countRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { applyCount, countAsset, moveAsset } from "@/lib/inventory/availability";

async function lockCount(tx: Tx, spaceId: string, countId: string) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "StockCount" WHERE "id" = ${countId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That count wasn't found.", "not_found");
  return tx.stockCount.findUniqueOrThrow({
    where: { id: countId },
    include: { lines: { include: { item: { select: { name: true, tracking: true } } } }, scans: { include: { asset: { select: { id: true, itemId: true, status: true, locationId: true } } } } },
  });
}

type LockedCount = Awaited<ReturnType<typeof lockCount>>;

/** Variance per line: quantity lines compare counted with the snapshot; serialized lines compare scans with available assets. */
export async function countVariances(tx: Tx, count: LockedCount) {
  const result: { lineId: string; itemName: string; variance: number; counted: boolean }[] = [];
  for (const line of count.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const expected = await tx.asset.count({ where: { itemId: line.itemId, locationId: line.locationId, status: "AVAILABLE" } });
      const scanned = count.scans.filter((s) => s.asset.itemId === line.itemId && s.locationId === line.locationId).length;
      result.push({ lineId: line.id, itemName: line.item.name, variance: scanned - expected, counted: true });
    } else {
      result.push({ lineId: line.id, itemName: line.item.name, variance: line.countedQty === null ? 0 : line.countedQty - line.expectedQty, counted: line.countedQty !== null });
    }
  }
  return result;
}

export async function submitCount(tx: Tx, input: { spaceId: string; countId: string; actorId: string | null }) {
  const count = await lockCount(tx, input.spaceId, input.countId);
  if (count.status !== "IN_PROGRESS") throw new DomainError("This count was already submitted.", "conflict");
  if (!count.lines.some((l) => l.countedQty !== null) && count.scans.length === 0) throw new DomainError("Count at least one line before submitting.", "invalid");
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  await recordAuditEvent({ client: tx, action: "count.submitted", spaceId: input.spaceId, actorId: input.actorId, targetType: "StockCount", targetId: count.id });
}

/**
 * Post a submitted count: each counted line sets the balance to what was
 * found (through the availability module, against the snapshot). When any
 * variance is above the space's threshold, someone who neither started nor
 * counted it must post it (four-eyes). Uncounted lines are left alone.
 */
export async function postCount(tx: Tx, input: { spaceId: string; countId: string; actorId: string | null }) {
  const count = await lockCount(tx, input.spaceId, input.countId);
  if (count.status !== "SUBMITTED") throw new DomainError("Submit the count before posting it.", "conflict");
  const variances = await countVariances(tx, count);
  const threshold = count.varianceThreshold ?? 0;
  const counters = new Set([count.startedById, ...count.lines.map((l) => l.countedById), ...count.scans.map((s) => s.scannedById)].filter(Boolean));
  if (variances.some((v) => Math.abs(v.variance) > threshold) && input.actorId && counters.has(input.actorId)) {
    throw new DomainError("This count has variances above the threshold, so someone who didn't count it must post it.", "forbidden");
  }
  const stale: string[] = [];
  for (const line of count.lines) {
    if (line.item.tracking === "SERIALIZED" || line.countedQty === null) continue;
    const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: line.itemId, locationId: line.locationId } }, select: { onHand: true } });
    if ((level?.onHand ?? 0) !== line.expectedQty) stale.push(line.item.name);
  }
  if (stale.length) throw new DomainError(`Stock moved since the count started for ${stale.slice(0, 3).join(", ")}${stale.length > 3 ? " and more" : ""}. Recount those lines.`, "conflict");
  const actor = { userId: input.actorId };
  const ref = { refType: "StockCount", refId: count.id };
  let adjusted = 0;
  for (const line of count.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const scansHere = count.scans.filter((s) => s.asset.itemId === line.itemId && s.locationId === line.locationId);
      for (const scan of scansHere) {
        if (scan.asset.status === "LOST") await countAsset(tx, { spaceId: input.spaceId, assetId: scan.assetId, outcome: "found", locationId: line.locationId }, actor, ref);
        else if (scan.asset.status === "AVAILABLE" && scan.asset.locationId !== line.locationId) await moveAsset(tx, { spaceId: input.spaceId, assetId: scan.assetId, toLocationId: line.locationId }, actor, ref);
      }
      const scannedIds = new Set(count.scans.map((s) => s.assetId));
      const missing = await tx.asset.findMany({ where: { itemId: line.itemId, locationId: line.locationId, status: "AVAILABLE", id: { notIn: [...scannedIds] } }, select: { id: true } });
      for (const asset of missing) await countAsset(tx, { spaceId: input.spaceId, assetId: asset.id, outcome: "missing", locationId: line.locationId }, actor, ref);
      adjusted += missing.length;
      continue;
    }
    if (line.countedQty === null) continue;
    const delta = await applyCount(tx, { spaceId: input.spaceId, itemId: line.itemId, locationId: line.locationId, expected: line.expectedQty, counted: line.countedQty }, actor, ref);
    if (delta !== 0) adjusted += 1;
  }
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "POSTED", postedAt: new Date(), postedById: input.actorId } });
  await recordAuditEvent({ client: tx, action: "count.posted", spaceId: input.spaceId, actorId: input.actorId, targetType: "StockCount", targetId: count.id, metadata: { adjustedLines: adjusted } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "count.posted", data: { countId: count.id, reference: countRef(count.number), adjustedLines: adjusted } });
  return { adjusted };
}

export async function cancelCount(tx: Tx, input: { spaceId: string; countId: string; actorId: string | null }) {
  const count = await lockCount(tx, input.spaceId, input.countId);
  if (count.status === "POSTED" || count.status === "CANCELLED") throw new DomainError("This count is already closed.", "conflict");
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "CANCELLED" } });
  await recordAuditEvent({ client: tx, action: "count.cancelled", spaceId: input.spaceId, actorId: input.actorId, targetType: "StockCount", targetId: count.id });
}

/** Back to counting after a submit (to recount stale or wrong lines). */
export async function reopenCount(tx: Tx, input: { spaceId: string; countId: string; actorId: string | null }) {
  const count = await lockCount(tx, input.spaceId, input.countId);
  if (count.status !== "SUBMITTED") throw new DomainError("Only a submitted count can be reopened.", "conflict");
  await tx.stockCount.update({ where: { id: count.id }, data: { status: "IN_PROGRESS", submittedAt: null } });
  await recordAuditEvent({ client: tx, action: "count.reopened", spaceId: input.spaceId, actorId: input.actorId, targetType: "StockCount", targetId: count.id });
}

/** Snapshot a stale line again (start of a recount). */
export async function refreshCountLine(tx: Tx, input: { spaceId: string; countId: string; lineId: string }) {
  const line = await tx.stockCountLine.findFirst({ where: { id: input.lineId, countId: input.countId, count: { spaceId: input.spaceId, status: "IN_PROGRESS" } } });
  if (!line) throw new DomainError("That line isn't open for counting.", "not_found");
  const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: line.itemId, locationId: line.locationId } }, select: { onHand: true } });
  await tx.stockCountLine.update({ where: { id: line.id }, data: { expectedQty: level?.onHand ?? 0, countedQty: null, countedById: null, countedAt: null } });
}
