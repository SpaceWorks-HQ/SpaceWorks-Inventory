// Generated from app/s/[spaceSlug]/stock/movements/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { withParams } from "@/components/catalogue/words";
import { loadMovements, movementWhere, PAGE_SIZE, parseMovementFilters } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatDayTime, formatTimeZoneName } from "@/lib/format/datetime";
import { canViewReports, requireSpace } from "@/lib/permissions";

export async function loadStockMovementsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/stock/movements">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const filters = parseMovementFilters(query);
const where = await movementWhere(space.id, filters, space.timezone);
const total = await prisma.stockMovement.count({ where });
const rows = (await loadMovements(space.id, space.slug, where, { take: PAGE_SIZE, skip: (filters.page - 1) * PAGE_SIZE })).map((row) => ({ ...row, when: formatDayTime(row.createdAt, space.timezone) }));
const item = filters.itemId ? await prisma.item.findFirst({ where: { id: filters.itemId, spaceId: space.id }, select: { name: true } }) : null;
const asset = filters.assetId ? await prisma.asset.findFirst({ where: { id: filters.assetId, spaceId: space.id }, select: { assetTag: true } }) : null;
const itemLabel = asset?.assetTag ?? item?.name ?? null;
const slug = space.slug;
const zone = formatTimeZoneName(new Date(), space.timezone);
const linkParams = { type: filters.type, item: filters.itemId, asset: filters.assetId, q: filters.q, from: filters.from, to: filters.to, ref: filters.ref };
const exportHref = canViewReports(membership) ? withParams(`/s/${slug}/stock/movements/export`, linkParams) : null;
const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
const filtered = Object.values(linkParams).some(Boolean);
return viewDto({ filters, total, rows, itemLabel, slug, zone, linkParams, exportHref, pageCount, filtered } as const);
}
