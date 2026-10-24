import "server-only";

import { prisma } from "@/lib/db";
import { countRef } from "@/lib/catalogue/references";
import { locationTree } from "@/lib/catalogue/locations";
import { scopeWords, statusesFor, type CountFilter } from "./countsLogic";

/** Read models for the counts list, the new-count form and count schedules. */

async function scopeNames(spaceId: string) {
  const [locations, categories] = await Promise.all([
    locationTree(spaceId, prisma, { includeArchived: true }),
    prisma.category.findMany({ where: { spaceId }, select: { id: true, name: true } }),
  ]);
  return { paths: new Map(locations.map((l) => [l.id, l.path])), categories: new Map(categories.map((c) => [c.id, c.name])) };
}

export async function listCounts(spaceId: string, filter: CountFilter) {
  const statuses = statusesFor(filter);
  const [counts, names] = await Promise.all([
    prisma.stockCount.findMany({
      where: { spaceId, ...(statuses ? { status: { in: statuses } } : {}) },
      orderBy: { number: "desc" },
      take: 100,
      select: { id: true, number: true, name: true, status: true, blind: true, locationId: true, categoryId: true, createdAt: true, submittedAt: true, postedAt: true, lines: { select: { countedQty: true } }, _count: { select: { scans: true } } },
    }),
    scopeNames(spaceId),
  ]);
  return counts.map((count) => ({
    id: count.id,
    reference: countRef(count.number),
    name: count.name,
    status: count.status,
    blind: count.blind,
    scope: scopeWords({ locationPath: count.locationId ? names.paths.get(count.locationId) ?? null : null, categoryName: count.categoryId ? names.categories.get(count.categoryId) ?? null : null }),
    lines: count.lines.length,
    counted: count.lines.filter((line) => line.countedQty !== null).length,
    scans: count._count.scans,
    createdAt: count.createdAt,
    updatedAt: count.postedAt ?? count.submittedAt ?? count.createdAt,
  }));
}

/** Locations, categories and active items for the new-count, schedule and add-line forms. */
export async function countFormOptions(spaceId: string) {
  const [locations, categories, items] = await Promise.all([
    locationTree(spaceId),
    prisma.category.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.item.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, name: true, sku: true, tracking: true }, orderBy: { name: "asc" }, take: 2000 }),
  ]);
  return {
    locations: locations.map((l) => ({ id: l.id, path: l.path, code: l.code })),
    categories,
    items: items.map((item) => ({ id: item.id, name: item.name, sku: item.sku, serialized: item.tracking === "SERIALIZED" })),
  };
}

export async function listSchedules(spaceId: string) {
  const [schedules, names] = await Promise.all([
    prisma.countSchedule.findMany({ where: { spaceId }, orderBy: [{ active: "desc" }, { nextRunAt: "asc" }], take: 100 }),
    scopeNames(spaceId),
  ]);
  return schedules.map((schedule) => ({
    id: schedule.id,
    name: schedule.name,
    everyDays: schedule.everyDays,
    blind: schedule.blind,
    active: schedule.active,
    nextRunAt: schedule.nextRunAt,
    scope: scopeWords({ locationPath: schedule.locationId ? names.paths.get(schedule.locationId) ?? null : null, categoryName: schedule.categoryId ? names.categories.get(schedule.categoryId) ?? null : null }),
  }));
}
