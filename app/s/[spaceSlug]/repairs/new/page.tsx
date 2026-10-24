import type { Metadata } from "next";
import { ReportRepairForm } from "@/components/repairs/ReportRepairForm";
import { PageHeader } from "@/components/ui/display";
import { FormPageLayout } from "@/components/ui/layouts";
import { locationTree } from "@/lib/catalogue/locations";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { canViewStock } from "@/lib/roles";

export const metadata: Metadata = { title: "Report a problem" };

export default async function ReportRepairPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/repairs/new">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  const { space, membership } = await requireSpace(spaceSlug, "MEMBER");
  const staff = canViewStock(membership);
  const [items, assets, locations] = await Promise.all([
    prisma.item.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: { name: "asc" }, take: 2000, select: { id: true, name: true, sku: true, tracking: true } }),
    staff ? prisma.asset.findMany({ where: { spaceId: space.id, status: { notIn: ["RETIRED", "LOST"] } }, orderBy: { assetTag: "asc" }, take: 5000, select: { id: true, itemId: true, assetTag: true, status: true } }) : Promise.resolve([]),
    staff ? locationTree(space.id) : Promise.resolve([]),
  ]);
  const presetItem = typeof query.item === "string" ? query.item : null;
  const presetAsset = typeof query.asset === "string" ? query.asset : null;
  const locationOptions = locations.map((location) => ({ id: location.id, label: `${location.code} · ${location.path}` }));

  return (
    <FormPageLayout header={<PageHeader title="Report a problem" description={staff ? "Something damaged or broken? Describe it, add photos and take it out of use until it is fixed." : "Something you borrowed or found is damaged or broken? Tell the inventory managers."} />}>
      <ReportRepairForm slug={space.slug} staff={staff} items={items} assets={assets} locations={locationOptions} presetItemId={presetItem} presetAssetId={presetAsset} />
    </FormPageLayout>
  );
}
