// Generated from app/s/[spaceSlug]/items/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { itemImageUrl } from "@/lib/catalogue/images";
import { listItems, parseItemFilters } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format/money";
import { canManageCatalogue, requireSpace } from "@/lib/permissions";

export async function loadItemsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/items">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const filters = parseItemFilters(query);
const list = await listItems(space.id, filters);
const categories = await prisma.category.findMany({ where: { spaceId: space.id, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
const anyItems = list.total > 0 || (await prisma.item.count({ where: { spaceId: space.id } })) > 0;
const slug = space.slug;
const canEdit = canManageCatalogue(membership);
const rows = list.rows.map((row) => ({ ...row, imageUrl: row.imageId ? itemImageUrl(slug, row.imageId) : null, value: formatMoney(row.valueMinor, space.currency) }));
const total = list.total;
const pageCount = list.pageCount;
const linkParams = { q: filters.q, category: filters.categoryId, tracking: filters.tracking, lendable: filters.lendable, low: filters.low, archived: filters.archived };
return viewDto({ filters, categories, anyItems, slug, canEdit, rows, total, pageCount, linkParams } as const);
}
