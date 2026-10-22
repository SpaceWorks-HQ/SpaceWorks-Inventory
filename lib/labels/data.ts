import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { locationTree } from "@/lib/catalogue/locations";
import { MAX_LABELS } from "./layout";
import type { LabelData } from "./pdf";

export const LABEL_KINDS = ["items", "assets", "locations", "kits", "containers"] as const;
export type LabelKind = (typeof LABEL_KINDS)[number];

const id = z.string().trim().min(1).max(64);
/** What to print: chosen ids, or everything of a kind that matches the filters. */
export const labelQuerySchema = z.object({
  kind: z.enum(LABEL_KINDS),
  ids: z.array(id).max(MAX_LABELS).default([]),
  all: z.boolean().default(false),
  locationId: id.nullish().transform((v) => v ?? null),
  categoryId: id.nullish().transform((v) => v ?? null),
}).refine((q) => q.all || q.ids.length > 0, { message: "Choose at least one label to print." });
export type LabelQuery = z.output<typeof labelQuerySchema>;

export type LabelRow = LabelData & { id: string };

async function locationScope(spaceId: string, locationId: string | null) {
  const tree = await locationTree(spaceId);
  const paths = new Map(tree.map((node) => [node.id, node.path]));
  if (!locationId) return { paths, within: null };
  const children = new Map<string, string[]>();
  for (const node of tree) if (node.parentId) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node.id]);
  const within: string[] = [];
  const stack = paths.has(locationId) ? [locationId] : [];
  while (stack.length) {
    const current = stack.pop()!;
    within.push(current);
    stack.push(...(children.get(current) ?? []));
  }
  return { paths, within };
}

/**
 * The labels to print (at most 500), in a stable order. Every lookup is
 * scoped to the space; ids from another space simply match nothing.
 */
export async function findLabelRows(spaceId: string, query: LabelQuery, limit = MAX_LABELS): Promise<LabelRow[]> {
  const take = Math.min(limit, MAX_LABELS);
  const byId = query.all ? {} : { id: { in: query.ids } };
  const { paths, within } = await locationScope(spaceId, query.locationId);
  const inLocation = within ? { in: within } : undefined;

  if (query.kind === "items") {
    const where: Prisma.ItemWhereInput = {
      spaceId, archivedAt: null, ...byId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(inLocation ? { OR: [{ stockLevels: { some: { locationId: inLocation, onHand: { gt: 0 } } } }, { assets: { some: { locationId: inLocation } } }] } : {}),
    };
    const items = await prisma.item.findMany({
      where, orderBy: [{ name: "asc" }, { sku: "asc" }], take,
      select: { id: true, sku: true, name: true, qrCode: true, stockLevels: { where: { onHand: { gt: 0 } }, orderBy: { onHand: "desc" }, take: 1, select: { locationId: true } } },
    });
    return items.map((item) => ({ id: item.id, qrCode: item.qrCode, code: item.sku, name: item.name, location: paths.get(item.stockLevels[0]?.locationId ?? "") ?? null }));
  }
  if (query.kind === "assets") {
    const assets = await prisma.asset.findMany({
      where: { spaceId, ...byId, status: { notIn: ["LOST", "RETIRED"] }, item: { archivedAt: null, ...(query.categoryId ? { categoryId: query.categoryId } : {}) }, ...(inLocation ? { locationId: inLocation } : {}) },
      orderBy: { assetTag: "asc" }, take,
      select: { id: true, assetTag: true, qrCode: true, serialNumber: true, locationId: true, item: { select: { name: true } } },
    });
    return assets.map((asset) => ({
      id: asset.id, qrCode: asset.qrCode, code: asset.assetTag,
      name: asset.serialNumber ? `${asset.item.name} · SN ${asset.serialNumber}` : asset.item.name,
      location: asset.locationId ? (paths.get(asset.locationId) ?? null) : null,
    }));
  }
  if (query.kind === "locations") {
    const locations = await prisma.location.findMany({
      where: { spaceId, archivedAt: null, ...byId, ...(inLocation ? { id: query.all ? inLocation : { in: query.ids.filter((v) => within!.includes(v)) } } : {}) },
      select: { id: true, code: true, name: true, qrCode: true, parentId: true },
    });
    const sortKey = (loc: { id: string; name: string }) => paths.get(loc.id) ?? loc.name;
    return locations
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .slice(0, take)
      .map((loc) => ({ id: loc.id, qrCode: loc.qrCode, code: loc.code, name: loc.name, location: loc.parentId ? (paths.get(loc.parentId) ?? null) : null }));
  }
  if (query.kind === "kits") {
    const kits = await prisma.kit.findMany({ where: { spaceId, archivedAt: null, ...byId }, orderBy: { name: "asc" }, take, select: { id: true, name: true, qrCode: true, _count: { select: { lines: true } } } });
    return kits.map((kit) => ({ id: kit.id, qrCode: kit.qrCode, code: kit.name, name: `Kit of ${kit._count.lines} ${kit._count.lines === 1 ? "item" : "items"}`, location: null }));
  }
  const containers = await prisma.container.findMany({ where: { spaceId, archivedAt: null, ...byId }, orderBy: { code: "asc" }, take, select: { id: true, code: true, name: true, qrCode: true } });
  return containers.map((box) => ({ id: box.id, qrCode: box.qrCode, code: box.code, name: box.name, location: null }));
}

/** Read `?kind=…&ids=a,b` or `?kind=…&all=1&location=…&category=…` from a URL. */
export function parseLabelSearchParams(params: URLSearchParams) {
  return labelQuerySchema.safeParse({
    kind: params.get("kind") ?? undefined,
    ids: (params.get("ids") ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    all: params.get("all") === "1",
    locationId: params.get("location") || null,
    categoryId: params.get("category") || null,
  });
}

/** Locations (with paths) and categories for the label picker's filters. */
export async function labelFilterOptions(spaceId: string) {
  const [tree, categories] = await Promise.all([
    locationTree(spaceId),
    prisma.category.findMany({ where: { spaceId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { locations: tree.map((node) => ({ id: node.id, label: node.path })), categories: categories.map((c) => ({ id: c.id, label: c.name })) };
}
