import "server-only";

import { MovementType, type Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { zonedInputToIso } from "@/lib/timeZone";
import { locationTree } from "./locations";
import { qrUrl } from "./qr";
import { countRef, loanRef, purchaseRef, transferRef } from "./references";

/** Read models for the catalogue and stock pages (no writes). */
export const PAGE_SIZE = 50;
export type SearchParams = Record<string, string | string[] | undefined>;

export function param(params: SearchParams, key: string, max = 100) {
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first.trim().slice(0, max) : "";
}

export function pageOf(params: SearchParams) {
  const page = Number.parseInt(param(params, "page"), 10);
  return Number.isSafeInteger(page) && page > 1 ? Math.min(page, 10_000) : 1;
}

/** The QR as SVG: Deep Ink modules on a white plate with a quiet zone, in both colour modes. */
export function qrSvg(code: string) {
  return QRCode.toString(qrUrl(code), { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#142C2AFF", light: "#FFFFFFFF" } });
}

/** Active locations as picker options, labelled with their path ("Main › Room 2 › Shelf B"). */
export async function locationOptions(spaceId: string) {
  return (await locationTree(spaceId)).map((row) => ({ id: row.id, label: `${row.path} (${row.code})`, depth: row.depth }));
}

/** A location and everything inside it. */
export async function descendantIds(spaceId: string, rootId: string) {
  const rows = await prisma.location.findMany({ where: { spaceId }, select: { id: true, parentId: true } });
  if (!rows.some((row) => row.id === rootId)) return [];
  const children = new Map<string, string[]>();
  for (const row of rows) if (row.parentId) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row.id]);
  const ids = [rootId];
  for (let index = 0; index < ids.length && index < 5000; index += 1) ids.push(...(children.get(ids[index]!) ?? []));
  return ids;
}

// ───────────── Items ─────────────

export type ItemFilters = { q: string; categoryId: string; tracking: "" | "QUANTITY" | "SERIALIZED"; lendable: "" | "yes" | "no"; low: boolean; archived: boolean; page: number };

export function parseItemFilters(params: SearchParams): ItemFilters {
  const tracking = param(params, "tracking");
  const lendable = param(params, "lendable");
  return {
    q: param(params, "q"),
    categoryId: param(params, "category", 64),
    tracking: tracking === "QUANTITY" || tracking === "SERIALIZED" ? tracking : "",
    lendable: lendable === "yes" || lendable === "no" ? lendable : "",
    low: param(params, "low") === "1",
    archived: param(params, "archived") === "1",
    page: pageOf(params),
  };
}

/** Items whose free stock across the space is at or below their reorder point. */
async function lowStockIds(spaceId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT i."id" FROM "Item" i LEFT JOIN "StockLevel" s ON s."itemId" = i."id"
    WHERE i."spaceId" = ${spaceId} AND i."reorderPoint" IS NOT NULL
    GROUP BY i."id", i."reorderPoint"
    HAVING COALESCE(SUM(s."onHand" - s."reserved" - s."quarantined"), 0) <= i."reorderPoint"`;
  return rows.map((row) => row.id);
}

export async function listItems(spaceId: string, filters: ItemFilters) {
  const where: Prisma.ItemWhereInput = {
    spaceId,
    ...(filters.archived ? {} : { archivedAt: null }),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.tracking ? { tracking: filters.tracking } : {}),
    ...(filters.lendable ? { lendable: filters.lendable === "yes" } : {}),
    ...(filters.q ? { OR: [
      { name: { contains: filters.q, mode: "insensitive" } },
      { sku: { contains: filters.q, mode: "insensitive" } },
      { barcode: { contains: filters.q, mode: "insensitive" } },
      { tags: { has: filters.q } },
    ] } : {}),
  };
  if (filters.low) where.id = { in: await lowStockIds(spaceId) };
  const [total, items] = await Promise.all([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, name: true, sku: true, tracking: true, lendable: true, archivedAt: true, reorderPoint: true, avgCostMinor: true,
        category: { select: { name: true } }, unit: { select: { symbol: true } },
        images: { select: { id: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      },
    }),
  ]);
  const totals = await availabilityFor(spaceId, items.map((item) => item.id));
  const rows = items.map((item) => {
    const stock = availabilityOf(totals, item.id);
    return {
      id: item.id, name: item.name, sku: item.sku, tracking: item.tracking, lendable: item.lendable, archived: item.archivedAt !== null,
      category: item.category?.name ?? null, unit: item.unit?.symbol ?? null, imageId: item.images[0]?.id ?? null,
      onHand: stock.onHand, available: stock.available, onLoan: stock.onLoan, inTransit: stock.inTransit,
      low: item.reorderPoint !== null && stock.available <= item.reorderPoint,
      valueMinor: stock.onHand * item.avgCostMinor,
    };
  });
  return { total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), rows };
}

// ───────────── Stock ledger ─────────────

export const MOVEMENT_TYPES = Object.values(MovementType);
export type MovementFilters = { type: MovementType | ""; itemId: string; assetId: string; q: string; from: string; to: string; ref: string; page: number };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseMovementFilters(params: SearchParams): MovementFilters {
  const type = param(params, "type");
  const from = param(params, "from", 10);
  const to = param(params, "to", 10);
  return {
    type: (MOVEMENT_TYPES as string[]).includes(type) ? (type as MovementType) : "",
    itemId: param(params, "item", 64),
    assetId: param(params, "asset", 64),
    q: param(params, "q"),
    from: DATE.test(from) ? from : "",
    to: DATE.test(to) ? to : "",
    ref: param(params, "ref", 64),
    page: pageOf(params),
  };
}

/** "2026-10-23" → the next calendar day, for an exclusive end bound. */
export function nextDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
}

/** Resolve "LN-0042", "TR-7", "CC-3" or "PO-11" (or a raw id) to ledger references. */
async function refFilter(spaceId: string, ref: string): Promise<Prisma.StockMovementWhereInput> {
  const match = ref.toUpperCase().match(/^(LN|TR|CC|PO)-?0*(\d{1,9})$/);
  if (!match) return { refId: ref };
  const number = Number(match[2]);
  const ids = async (rows: Promise<{ id: string }[]>) => (await rows).map((row) => row.id);
  switch (match[1]) {
    case "LN": return { refType: "Loan", refId: { in: await ids(prisma.loan.findMany({ where: { spaceId, number }, select: { id: true } })) } };
    case "TR": return { refType: "Transfer", refId: { in: await ids(prisma.transfer.findMany({ where: { number, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] }, select: { id: true } })) } };
    case "CC": return { refType: "StockCount", refId: { in: await ids(prisma.stockCount.findMany({ where: { spaceId, number }, select: { id: true } })) } };
    default: return { refType: "PurchaseItem", refId: { in: await ids(prisma.purchaseItem.findMany({ where: { spaceId, number }, select: { id: true } })) } };
  }
}

export async function movementWhere(spaceId: string, filters: MovementFilters, timeZone: string): Promise<Prisma.StockMovementWhereInput> {
  const from = filters.from ? zonedInputToIso(`${filters.from}T00:00`, timeZone) : null;
  const to = filters.to ? zonedInputToIso(`${nextDay(filters.to)}T00:00`, timeZone) : null;
  return {
    spaceId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.itemId ? { itemId: filters.itemId } : {}),
    ...(filters.assetId ? { assetId: filters.assetId } : {}),
    ...(filters.q ? { item: { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { sku: { contains: filters.q, mode: "insensitive" } }] } } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lt: new Date(to) } : {}) } } : {}),
    ...(filters.ref ? await refFilter(spaceId, filters.ref) : {}),
  };
}

const movementSelect = {
  id: true, createdAt: true, type: true, quantity: true, reservedDelta: true, quarantinedDelta: true, balanceAfter: true, reason: true, note: true,
  locationId: true, actorId: true, actorApiTokenId: true, refType: true, refId: true,
  item: { select: { id: true, name: true, sku: true } }, asset: { select: { id: true, assetTag: true } },
} satisfies Prisma.StockMovementSelect;

export type MovementRow = Awaited<ReturnType<typeof describeMovements>>[number];

/** One page of the ledger, newest first, with locations, people and references resolved. */
export async function loadMovements(spaceId: string, slug: string, where: Prisma.StockMovementWhereInput, page: { take: number; skip?: number; cursor?: string }) {
  const rows = await prisma.stockMovement.findMany({
    where, select: movementSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: page.take,
    ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : { skip: page.skip ?? 0 }),
  });
  return describeMovements(spaceId, slug, rows);
}

type RawMovement = Prisma.StockMovementGetPayload<{ select: typeof movementSelect }>;

async function describeMovements(spaceId: string, slug: string, rows: RawMovement[]) {
  const idsOf = (type: string) => [...new Set(rows.filter((row) => row.refType === type && row.refId).map((row) => row.refId!))];
  const [locations, actors, loans, transfers, counts, purchases, incidents] = await Promise.all([
    prisma.location.findMany({ where: { spaceId, id: { in: [...new Set(rows.flatMap((row) => (row.locationId ? [row.locationId] : [])))] } }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.flatMap((row) => (row.actorId ? [row.actorId] : [])))] } }, select: { id: true, name: true, email: true } }),
    prisma.loan.findMany({ where: { spaceId, id: { in: idsOf("Loan") } }, select: { id: true, number: true } }),
    prisma.transfer.findMany({ where: { id: { in: idsOf("Transfer") }, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] }, select: { id: true, number: true } }),
    prisma.stockCount.findMany({ where: { spaceId, id: { in: idsOf("StockCount") } }, select: { id: true, number: true } }),
    prisma.purchaseItem.findMany({ where: { spaceId, id: { in: idsOf("PurchaseItem") } }, select: { id: true, number: true } }),
    prisma.loanIncident.findMany({ where: { spaceId, id: { in: idsOf("LoanIncident") } }, select: { id: true, loan: { select: { id: true, number: true } } } }),
  ]);
  const base = `/s/${slug}`;
  const refs = new Map<string, { label: string; href: string | null }>();
  for (const row of loans) refs.set(`Loan:${row.id}`, { label: loanRef(row.number), href: `${base}/loans/${row.id}` });
  for (const row of transfers) refs.set(`Transfer:${row.id}`, { label: transferRef(row.number), href: `${base}/transfers/${row.id}` });
  for (const row of counts) refs.set(`StockCount:${row.id}`, { label: countRef(row.number), href: `${base}/counts/${row.id}` });
  for (const row of purchases) refs.set(`PurchaseItem:${row.id}`, { label: purchaseRef(row.number), href: `${base}/purchases` });
  for (const row of incidents) refs.set(`LoanIncident:${row.id}`, { label: `${loanRef(row.loan.number)} incident`, href: `${base}/loans/${row.loan.id}` });
  const fallback = (type: string, id: string): { label: string; href: string | null } | null => {
    if (type === "Import") return { label: "Import", href: `${base}/import?job=${encodeURIComponent(id)}` };
    if (type === "Asset") return { label: "New asset", href: `${base}/assets/${id}` };
    if (type === "SampleData") return { label: "Sample data", href: null };
    return null;
  };
  const locationById = new Map(locations.map((row) => [row.id, `${row.name} (${row.code})`]));
  const actorById = new Map(actors.map((row) => [row.id, row.name ?? row.email]));
  return rows.map((row) => ({
    id: row.id, createdAt: row.createdAt, type: row.type, quantity: row.quantity, reservedDelta: row.reservedDelta, quarantinedDelta: row.quarantinedDelta,
    balanceAfter: row.balanceAfter, reason: row.reason, note: row.note, item: row.item, asset: row.asset,
    location: row.locationId ? (locationById.get(row.locationId) ?? "Another space") : null,
    actor: row.actorId ? (actorById.get(row.actorId) ?? "Former member") : row.actorApiTokenId ? "API key" : "System",
    ref: row.refType && row.refId ? (refs.get(`${row.refType}:${row.refId}`) ?? fallback(row.refType, row.refId)) : null,
  }));
}
