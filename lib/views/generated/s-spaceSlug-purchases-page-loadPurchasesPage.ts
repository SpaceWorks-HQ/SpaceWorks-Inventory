// Generated from app/s/[spaceSlug]/purchases/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import type { PurchaseStatus } from "@prisma/client";
import { purchaseRef } from "@/lib/catalogue/references";
import { locationTree } from "@/lib/catalogue/locations";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format/datetime";
import { canAdjustStock, requireSpace } from "@/lib/permissions";
import { reorderSuggestions } from "@/lib/purchases";
import { type PurchaseRow } from "@/app/s/[spaceSlug]/purchases/_components/PurchasesTable";
const FILTERS = [
  { key: "open", label: "Open", statuses: ["REQUESTED", "APPROVED", "ORDERED"] },
  { key: "requested", label: "Requested", statuses: ["REQUESTED"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "ordered", label: "Ordered", statuses: ["ORDERED"] },
  { key: "received", label: "Received", statuses: ["RECEIVED"] },
  { key: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly PurchaseStatus[] }[];
function filterFor(value: unknown) {
  return FILTERS.find((filter) => filter.key === value) ?? FILTERS[0];
}
function countFor(counts: { status: PurchaseStatus; _count: { _all: number } }[], statuses: readonly PurchaseStatus[]) {
  return counts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
}
export async function loadPurchasesPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/purchases">) {
const { spaceSlug } = await params;
const query = await searchParams;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const manage = canAdjustStock(membership);
const filter = filterFor(query.status);
const [purchases, counts, suggestions, items, suppliers, locations] = await Promise.all([
    prisma.purchaseItem.findMany({
      where: { spaceId: space.id, status: { in: [...filter.statuses] } },
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: { id: true, number: true, name: true, quantity: true, status: true, unitCostMinor: true, paidMinor: true, link: true, note: true, supplierId: true, requestedById: true, createdAt: true, item: { select: { id: true, sku: true, tracking: true } } },
    }),
    prisma.purchaseItem.groupBy({ by: ["status"], where: { spaceId: space.id }, _count: { _all: true } }),
    reorderSuggestions(space.id),
    prisma.item.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: { name: "asc" }, take: 1000, select: { id: true, name: true, sku: true } }),
    prisma.supplier.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
    manage ? locationTree(space.id) : Promise.resolve([]),
  ]);
const requesterIds = [...new Set(purchases.map((row) => row.requestedById).filter((id): id is string => Boolean(id)))];
const requesters = await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true } });
const names = new Map(requesters.map((user) => [user.id, user.name]));
const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
const rows: PurchaseRow[] = purchases.map((row) => ({
    id: row.id,
    reference: purchaseRef(row.number),
    name: row.name,
    sku: row.item?.sku ?? null,
    linked: Boolean(row.item),
    quantity: row.quantity,
    status: row.status,
    unitCostMinor: row.unitCostMinor,
    link: row.link,
    note: row.note,
    supplier: row.supplierId ? supplierNames.get(row.supplierId) ?? null : null,
    supplierId: row.supplierId,
    paid: row.paidMinor !== null,
    requestedBy: row.requestedById ? names.get(row.requestedById) ?? "Former member" : null,
    requestedLabel: formatRelativeTime(row.createdAt, space.timezone),
  }));
const tabs = FILTERS.map((entry) => ({ href: `/s/${space.slug}/purchases${entry.key === "open" ? "" : `?status=${entry.key}`}`, label: `${entry.label} (${countFor(counts, entry.statuses)})`, active: entry.key === filter.key }));
const suggestionRows = suggestions.slice(0, 20).map((row) => ({ itemId: row.id, name: row.name, sku: row.sku, available: row.available, reorderPoint: row.reorderPoint ?? 0, reorderQuantity: row.reorderQuantity ?? null, onOrder: row.onOrder, supplier: row.supplier?.name ?? null }));
const locationOptions = locations.map((location) => ({ id: location.id, label: `${location.code} · ${location.path}` }));
return viewDto({ space, manage, filter, suggestions, items, suppliers, locations, rows, tabs, suggestionRows, locationOptions } as const);
}
