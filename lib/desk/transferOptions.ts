import "server-only";

import type { Tx } from "@/lib/db";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { singleShelfAvailability } from "./transferStock";
import { locationOptions } from "./locations";

/** Other active spaces of the install this space can push to or pull from. */
export async function otherSpaces(spaceId: string) {
  const spaces = await prisma.space.findMany({
    where: { id: { not: spaceId }, archivedAt: null },
    select: { slug: true, name: true, acceptsTransfers: true, shareStockWithSpaces: true },
    orderBy: { name: "asc" },
  });
  return {
    pushTargets: spaces.filter((space) => space.acceptsTransfers).map((space) => ({ slug: space.slug, name: space.name })),
    pullSources: spaces.filter((space) => space.shareStockWithSpaces).map((space) => ({ slug: space.slug, name: space.name })),
  };
}

/** This space's stock that is free to move, per location (for internal moves and pushes). */
export async function localStock(spaceId: string) {
  const levels = await prisma.stockLevel.findMany({
    where: { spaceId, item: { archivedAt: null }, location: { archivedAt: null } },
    select: { itemId: true, locationId: true, onHand: true, reserved: true, quarantined: true, item: { select: { name: true, sku: true, tracking: true } } },
  });
  const items = new Map<string, { id: string; name: string; sku: string; serialized: boolean; available: Record<string, number> }>();
  for (const level of levels) {
    const free = level.onHand - level.reserved - level.quarantined;
    if (free <= 0) continue;
    const entry = items.get(level.itemId) ?? { id: level.itemId, name: level.item.name, sku: level.item.sku, serialized: level.item.tracking === "SERIALIZED", available: {} };
    entry.available[level.locationId] = free;
    items.set(level.itemId, entry);
  }
  return { items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name)), locations: await locationOptions(spaceId) };
}

/**
 * Another space's shared stock list: item names and available counts only
 * (no locations, costs or assets). Null when that space doesn't share.
 */
export async function sharedStock(otherSlug: string, viewerSpaceId: string) {
  const space = await prisma.space.findFirst({ where: { slug: otherSlug, archivedAt: null, shareStockWithSpaces: true, id: { not: viewerSpaceId } }, select: { id: true, slug: true, name: true } });
  if (!space) return null;
  const items = await prisma.item.findMany({ where: { spaceId: space.id, archivedAt: null }, select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 2000 });
  const levels = await prisma.stockLevel.findMany({
    where: { spaceId: space.id, itemId: { in: items.map((item) => item.id) }, location: { archivedAt: null } },
    select: { itemId: true, onHand: true, reserved: true, quarantined: true },
  });
  const available = singleShelfAvailability(levels);
  return {
    slug: space.slug,
    name: space.name,
    items: items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, available: available.get(item.id) ?? 0 })).filter((item) => item.available > 0),
  };
}

/**
 * For a pull request the requester can't see the source's shelves, so the
 * source location is the one that can cover most of the requested units.
 */
export async function pickSourceLocation(tx: Tx, sourceSpaceId: string, lines: { itemId: string; quantity: number }[]) {
  const levels = await tx.stockLevel.findMany({
    where: { spaceId: sourceSpaceId, itemId: { in: lines.map((line) => line.itemId) }, location: { archivedAt: null } },
    select: { itemId: true, locationId: true, onHand: true, reserved: true, quarantined: true },
  });
  const score = new Map<string, number>();
  for (const level of levels) {
    const wanted = lines.find((line) => line.itemId === level.itemId)?.quantity ?? 0;
    const free = Math.max(0, level.onHand - level.reserved - level.quarantined);
    score.set(level.locationId, (score.get(level.locationId) ?? 0) + Math.min(free, wanted));
  }
  const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) throw new DomainError("That space has none of those items free right now.", "conflict");
  return best[0];
}
