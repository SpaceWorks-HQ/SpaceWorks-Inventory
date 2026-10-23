// Generated from app/s/[spaceSlug]/stock/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import type { Prisma } from "@prisma/client";
import { descendantIds, locationOptions, PAGE_SIZE, pageOf, param } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { canAdjustStock, canViewReports, requireSpace } from "@/lib/permissions";
const place = (location: { name: string; code: string } | null) => (location ? `${location.name} (${location.code})` : null);
async function balances(spaceId: string, q: string, locationId: string, page: number) {
  const locationIds = locationId ? await descendantIds(spaceId, locationId) : null;
  const where: Prisma.StockLevelWhereInput = {
    spaceId,
    OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }],
    ...(locationIds ? { locationId: { in: locationIds } } : {}),
    ...(q ? { item: { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.stockLevel.count({ where }),
    prisma.stockLevel.findMany({
      where, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, orderBy: [{ item: { name: "asc" } }, { location: { code: "asc" } }],
      select: { id: true, onHand: true, reserved: true, quarantined: true, item: { select: { id: true, name: true, sku: true, unit: { select: { symbol: true } } } }, location: { select: { name: true, code: true } } },
    }),
  ]);
  return {
    total,
    rows: rows.map((row) => ({ id: row.id, itemId: row.item.id, item: row.item.name, sku: row.item.sku, unit: row.item.unit?.symbol ?? null, location: place(row.location)!, onHand: row.onHand, reserved: row.reserved, quarantined: row.quarantined, available: row.onHand - row.reserved - row.quarantined })),
  };
}
async function repairShelf(spaceId: string) {
  const [levels, assets] = await Promise.all([
    prisma.stockLevel.findMany({ where: { spaceId, quarantined: { gt: 0 }, item: { tracking: "QUANTITY" } }, select: { id: true, itemId: true, locationId: true, onHand: true, quarantined: true, item: { select: { name: true, sku: true, unit: { select: { symbol: true } } } }, location: { select: { name: true, code: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    prisma.asset.findMany({ where: { spaceId, status: "MAINTENANCE" }, select: { id: true, assetTag: true, condition: true, itemId: true, item: { select: { name: true } }, location: { select: { name: true, code: true } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
  ]);
  return {
    levels: levels.map((row) => ({ key: row.id, itemId: row.itemId, item: row.item.name, sku: row.item.sku, unit: row.item.unit?.symbol ?? null, locationId: row.locationId, location: place(row.location)!, quarantined: row.quarantined, onHand: row.onHand })),
    assets: assets.map((row) => ({ id: row.id, assetTag: row.assetTag, item: row.item.name, itemId: row.itemId, location: place(row.location), condition: row.condition })),
  };
}
export async function loadStockPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/stock">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const view = param(query, "view") === "repair" ? "repair" : "balances";
const q = param(query, "q");
const locationId = param(query, "location", 64);
const page = pageOf(query);
const locations = view === "balances" ? (await locationOptions(space.id)).map((row) => ({ id: row.id, label: row.label })) : [];
const stock = view === "balances" ? await balances(space.id, q, locationId, page) : { total: 0, rows: [] };
const shelf = view === "repair" ? await repairShelf(space.id) : { levels: [], assets: [] };
const slug = space.slug;
const canAct = canAdjustStock(membership);
const canExport = canViewReports(membership);
const filtered = Boolean(q || locationId);
const rows = stock.rows;
const total = stock.total;
const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
return viewDto({ view, q, locationId, page, locations, shelf, slug, canAct, canExport, filtered, rows, total, pageCount } as const);
}
