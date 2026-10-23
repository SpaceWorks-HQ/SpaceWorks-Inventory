import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/catalogue/Pagination";
import { withParams } from "@/components/catalogue/words";
import { MovementFilters } from "@/components/stock/MovementFilters";
import { MovementsTable } from "@/components/stock/MovementsTable";
import { StockTabs } from "@/components/stock/StockTabs";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { loadMovements, movementWhere, PAGE_SIZE, parseMovementFilters } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatDayTime, formatTimeZoneName } from "@/lib/format/datetime";
import { canViewReports, requireSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Stock ledger" };

export default async function StockMovementsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/stock/movements">) {
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

  return (
    <ListLayout
      header={<PageHeader title="Stock ledger" description={`Every change to stock, newest first. It can't be edited or deleted. Times in ${zone}.`} actions={exportHref ? <Button asChild variant="secondary"><a href={exportHref}>Export CSV</a></Button> : undefined} />}
      toolbar={
        <div className="flex flex-col gap-4">
          <StockTabs slug={slug} active="ledger" />
          <MovementFilters action={`/s/${slug}/stock/movements`} values={filters} itemLabel={itemLabel} />
        </div>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={filtered ? "No movements match these filters." : "No stock movements yet."} action={filtered ? <Button asChild variant="secondary"><Link href={`/s/${slug}/stock/movements`}>Clear filters</Link></Button> : undefined} />
      ) : (
        <div className="space-y-4">
          <MovementsTable slug={slug} rows={rows} />
          <Pagination path={`/s/${slug}/stock/movements`} params={linkParams} page={filters.page} pageCount={pageCount} total={total} noun="movements" />
        </div>
      )}
    </ListLayout>
  );
}
