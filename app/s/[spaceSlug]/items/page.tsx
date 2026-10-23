import Link from "next/link";
import { ItemFilters } from "@/components/catalogue/ItemFilters";
import { ItemsTable } from "@/components/catalogue/ItemsTable";
import { Pagination } from "@/components/catalogue/Pagination";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { itemImageUrl } from "@/lib/catalogue/images";
import { listItems, parseItemFilters } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format/money";
import { canManageCatalogue, requireSpace } from "@/lib/permissions";

export default async function ItemsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/items">) {
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

  return (
    <ListLayout
      header={
        <PageHeader
          title="Items"
          description="Everything the space stocks or lends, with what is on the shelf, out on loan and in transit."
          actions={
            <>
              <Button asChild variant="secondary"><Link href={`/s/${slug}/labels?kind=items`}>Print labels</Link></Button>
              {canEdit ? <Button asChild variant="primary"><Link href={`/s/${slug}/items/new`}>Add item</Link></Button> : null}
            </>
          }
        />
      }
      toolbar={anyItems ? <ItemFilters action={`/s/${slug}/items`} values={filters} categories={categories} /> : null}
    >
      {!anyItems ? (
        <EmptyState patch title="No items yet." action={canEdit ? <Button asChild variant="primary"><Link href={`/s/${slug}/items/new`}>Add an item</Link></Button> : undefined}>
          Add one, or import a spreadsheet.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No items match these filters." action={<Button asChild variant="secondary"><Link href={`/s/${slug}/items`}>Clear filters</Link></Button>} />
      ) : (
        <div className="space-y-4">
          <ItemsTable slug={slug} rows={rows} />
          <Pagination path={`/s/${slug}/items`} params={linkParams} page={filters.page} pageCount={pageCount} total={total} noun="items" />
        </div>
      )}
    </ListLayout>
  );
}
