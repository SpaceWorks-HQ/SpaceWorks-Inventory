// Generated from app/s/[spaceSlug]/assets/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import type { AssetStatus, Prisma } from "@prisma/client";
import { locationOptions, PAGE_SIZE, pageOf, param } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
const STATUSES: AssetStatus[] = ["AVAILABLE", "RESERVED", "ON_LOAN", "IN_TRANSIT", "MAINTENANCE", "LOST", "RETIRED"];
export async function loadAssetsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/assets">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const statusParam = param(query, "status");
const status = STATUSES.find((value) => value === statusParam) ?? null;
const values = { q: param(query, "q"), status: status ?? "", itemId: param(query, "item", 64), locationId: param(query, "location", 64) };
const page = pageOf(query);
const where: Prisma.AssetWhereInput = {
    spaceId: space.id,
    status: status ?? { not: "RETIRED" },
    ...(values.itemId ? { itemId: values.itemId } : {}),
    ...(values.locationId ? { locationId: values.locationId } : {}),
    ...(values.q ? { OR: [{ assetTag: { contains: values.q, mode: "insensitive" } }, { serialNumber: { contains: values.q, mode: "insensitive" } }] } : {}),
  };
const [total, assets, anyAssets, items, locations] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({ where, orderBy: { assetTag: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: { id: true, assetTag: true, serialNumber: true, status: true, condition: true, itemId: true, item: { select: { name: true } }, location: { select: { name: true, code: true } } } }),
    prisma.asset.count({ where: { spaceId: space.id } }),
    prisma.item.findMany({ where: { spaceId: space.id, tracking: "SERIALIZED" }, select: { id: true, name: true, sku: true }, orderBy: { name: "asc" }, take: 500 }),
    locationOptions(space.id),
  ]);
const rows = assets.map((asset) => ({ id: asset.id, assetTag: asset.assetTag, serialNumber: asset.serialNumber, status: asset.status, condition: asset.condition, itemId: asset.itemId, item: asset.item.name, location: asset.location ? `${asset.location.name} (${asset.location.code})` : null }));
const itemOptions = items.map((item) => ({ id: item.id, label: `${item.name} (${item.sku})` }));
const locationList = locations.map((row) => ({ id: row.id, label: row.label }));
const slug = space.slug;
const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
const linkParams = { q: values.q, status: values.status, item: values.itemId, location: values.locationId };
return viewDto({ values, page, total, anyAssets, items, locations, rows, itemOptions, locationList, slug, pageCount, linkParams } as const);
}
