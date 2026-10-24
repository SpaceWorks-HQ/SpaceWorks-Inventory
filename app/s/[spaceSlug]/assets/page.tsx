import type { Metadata } from "next";
import type { AssetStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { AssetFilters } from "@/components/catalogue/AssetFilters";
import { AssetsTable } from "@/components/catalogue/AssetsTable";
import { Pagination } from "@/components/catalogue/Pagination";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { locationOptions, PAGE_SIZE, pageOf, param } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Assets" };

const STATUSES: AssetStatus[] = ["AVAILABLE", "RESERVED", "ON_LOAN", "IN_TRANSIT", "MAINTENANCE", "LOST", "RETIRED"];

export default async function AssetsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/assets">) {
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

  return (
    <ListLayout
      header={<PageHeader title="Assets" description="Every serialized unit, with its tag, status and shelf." actions={<Button asChild variant="secondary"><Link href={`/s/${slug}/labels?kind=assets`}>Print labels</Link></Button>} />}
      toolbar={anyAssets > 0 ? <AssetFilters action={`/s/${slug}/assets`} values={values} items={itemOptions} locations={locationList} /> : null}
    >
      {anyAssets === 0 ? (
        <EmptyState patch title="No assets yet." action={<Button asChild variant="primary"><Link href={`/s/${slug}/items?tracking=SERIALIZED`}>Go to serialized items</Link></Button>}>
          Register units on a serialized item to give each one a tag.
        </EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState title="No assets match these filters." action={<Button asChild variant="secondary"><Link href={`/s/${slug}/assets`}>Clear filters</Link></Button>} />
      ) : (
        <div className="space-y-4">
          <AssetsTable slug={slug} rows={rows} />
          <Pagination path={`/s/${slug}/assets`} params={linkParams} page={page} pageCount={pageCount} total={total} noun="assets" />
        </div>
      )}
    </ListLayout>
  );
}
