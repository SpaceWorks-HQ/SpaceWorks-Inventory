import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError } from "@/lib/domainError";

/** A location and every location below it. */
export async function locationSubtree(tx: Tx, spaceId: string, rootId: string): Promise<string[]> {
  const all = await tx.location.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, parentId: true } });
  if (!all.some((l) => l.id === rootId)) throw new DomainError("That location wasn't found.", "not_found");
  const ids = [rootId];
  for (let i = 0; i < ids.length; i += 1) for (const child of all) if (child.parentId === ids[i]) ids.push(child.id);
  return ids;
}

/**
 * Open a cycle count: snapshot the on-hand quantity of every balance in
 * scope (a location subtree and/or a category). Counters enter what they
 * find; blind counts hide the snapshot from them.
 */
export async function startCount(tx: Tx, input: { spaceId: string; name: string; locationId: string | null; categoryId: string | null; blind: boolean; actorId: string | null }) {
  const name = input.name.trim();
  if (!name) throw new DomainError("Name the count, e.g. \"Electronics lab, October\".", "invalid");
  const open = await tx.stockCount.count({ where: { spaceId: input.spaceId, status: { in: ["IN_PROGRESS", "SUBMITTED"] }, locationId: input.locationId, categoryId: input.categoryId } });
  if (open > 0) throw new DomainError("A count of this scope is already open. Finish or cancel it first.", "conflict");
  const locationIds = input.locationId ? await locationSubtree(tx, input.spaceId, input.locationId) : null;
  if (input.categoryId && !(await tx.category.findFirst({ where: { id: input.categoryId, spaceId: input.spaceId }, select: { id: true } }))) throw new DomainError("That category wasn't found.", "not_found");
  const levels = await tx.stockLevel.findMany({
    where: {
      spaceId: input.spaceId,
      ...(locationIds ? { locationId: { in: locationIds } } : {}),
      item: { archivedAt: null, ...(input.categoryId ? { categoryId: input.categoryId } : {}) },
      location: { archivedAt: null },
    },
    select: { itemId: true, locationId: true, onHand: true },
    take: 5000,
  });
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { countVarianceThreshold: true } });
  const count = await tx.stockCount.create({
    data: {
      spaceId: input.spaceId,
      number: await nextSpaceSequence(tx, input.spaceId, "count"),
      name: name.slice(0, 120),
      locationId: input.locationId,
      categoryId: input.categoryId,
      blind: input.blind,
      varianceThreshold: space.countVarianceThreshold,
      startedById: input.actorId,
      lines: { create: levels.map((level) => ({ itemId: level.itemId, locationId: level.locationId, expectedQty: level.onHand })) },
    },
  });
  await recordAuditEvent({ client: tx, action: "count.started", spaceId: input.spaceId, actorId: input.actorId, targetType: "StockCount", targetId: count.id, metadata: { lines: levels.length, blind: input.blind } });
  return count;
}
