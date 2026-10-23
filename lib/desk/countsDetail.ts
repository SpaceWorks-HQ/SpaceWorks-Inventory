import "server-only";

import { prisma } from "@/lib/db";
import { countRef } from "@/lib/catalogue/references";
import { locationTree } from "@/lib/catalogue/locations";
import { fourEyes, isStale, lineVariance, scopeWords, showsExpected } from "./countsLogic";
import { namesOf } from "./evidence";

export type CountLineView = {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  serialized: boolean;
  unit: string | null;
  locationId: string;
  locationPath: string;
  countedQty: number | null;
  counterName: string | null;
  note: string | null;
  /** Null while a blind count is open: never sent to counters. */
  expected: number | null;
  variance: number | null;
  stale: boolean;
  scannedTags: string[];
};

/**
 * One count of this space for the counting page, or null when it isn't in
 * the space. Expected quantities and variances are left out entirely while
 * a blind count is open, so they never reach the counters' browsers.
 */
export async function countDetail(spaceId: string, countId: string, viewerId: string) {
  const count = await prisma.stockCount.findFirst({
    where: { id: countId, spaceId },
    include: {
      lines: { include: { item: { select: { name: true, sku: true, tracking: true, unit: { select: { symbol: true } } } } } },
      scans: { select: { assetId: true, locationId: true, scannedById: true, asset: { select: { assetTag: true, itemId: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!count) return null;
  const itemIds = [...new Set(count.lines.map((line) => line.itemId))];
  const [levels, assets, tree, category] = await Promise.all([
    prisma.stockLevel.findMany({ where: { spaceId, itemId: { in: itemIds } }, select: { itemId: true, locationId: true, onHand: true } }),
    prisma.asset.groupBy({ by: ["itemId", "locationId"], where: { spaceId, itemId: { in: itemIds }, status: "AVAILABLE" }, _count: { _all: true } }),
    locationTree(spaceId, prisma, { includeArchived: true }),
    count.categoryId ? prisma.category.findFirst({ where: { id: count.categoryId, spaceId }, select: { name: true } }) : null,
  ]);
  const key = (itemId: string, locationId: string | null) => `${itemId}:${locationId ?? ""}`;
  const onHand = new Map(levels.map((level) => [key(level.itemId, level.locationId), level.onHand]));
  const available = new Map(assets.map((row) => [key(row.itemId, row.locationId), row._count._all]));
  const paths = new Map(tree.map((location) => [location.id, location.path]));
  const people = await namesOf([count.startedById, count.postedById, ...count.lines.map((line) => line.countedById)]);
  const visible = showsExpected(count);

  const facts = count.lines.map((line) => {
    const scanned = count.scans.filter((scan) => scan.asset.itemId === line.itemId && scan.locationId === line.locationId);
    const fact = {
      tracking: line.item.tracking,
      expectedQty: line.expectedQty,
      countedQty: line.countedQty,
      onHand: onHand.get(key(line.itemId, line.locationId)) ?? 0,
      availableAssets: available.get(key(line.itemId, line.locationId)) ?? 0,
      scannedAssets: scanned.length,
    };
    return { line, scanned, fact, result: lineVariance(fact) };
  });

  const lines: CountLineView[] = facts.map(({ line, scanned, fact, result }) => ({
    id: line.id,
    itemId: line.itemId,
    itemName: line.item.name,
    sku: line.item.sku,
    serialized: line.item.tracking === "SERIALIZED",
    unit: line.item.unit?.symbol ?? null,
    locationId: line.locationId,
    locationPath: paths.get(line.locationId) ?? "Unknown location",
    countedQty: line.countedQty,
    counterName: line.countedById ? people.get(line.countedById) ?? "Someone" : null,
    note: line.note,
    expected: visible ? result.expected : null,
    variance: visible && result.counted ? result.variance : null,
    stale: count.status === "IN_PROGRESS" || count.status === "SUBMITTED" ? isStale(fact) : false,
    scannedTags: scanned.map((scan) => scan.asset.assetTag),
  }));

  const check = fourEyes({
    variances: facts.filter((f) => f.result.counted).map((f) => f.result.variance),
    threshold: count.varianceThreshold,
    viewerId,
    startedById: count.startedById,
    counterIds: [...count.lines.map((line) => line.countedById), ...count.scans.map((scan) => scan.scannedById)],
  });

  return {
    id: count.id,
    reference: countRef(count.number),
    name: count.name,
    status: count.status,
    blind: count.blind,
    showsExpected: visible,
    scope: scopeWords({ locationPath: count.locationId ? paths.get(count.locationId) ?? null : null, categoryName: category?.name ?? null }),
    threshold: count.varianceThreshold,
    startedBy: count.startedById ? people.get(count.startedById) ?? "Someone" : "A schedule",
    postedBy: count.postedById ? people.get(count.postedById) ?? "Someone" : null,
    createdAt: count.createdAt,
    submittedAt: count.submittedAt,
    postedAt: count.postedAt,
    lines,
    totals: { lines: lines.length, counted: lines.filter((l) => l.serialized ? l.scannedTags.length > 0 : l.countedQty !== null).length, stale: lines.filter((l) => l.stale).length },
    // The four-eyes check only matters once there is something to post (and expected numbers are visible).
    fourEyes: visible && count.status === "SUBMITTED" ? check : { overThreshold: false, involved: check.involved, blocked: false },
  };
}

export type CountDetail = NonNullable<Awaited<ReturnType<typeof countDetail>>>;
