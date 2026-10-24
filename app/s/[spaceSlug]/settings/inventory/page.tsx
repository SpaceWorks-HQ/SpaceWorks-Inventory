import Link from "next/link";
import { CategoriesPanel } from "@/components/settings/CategoriesPanel";
import { SectionForm } from "@/components/settings/SectionForm";
import { SECTION_DESCRIPTIONS } from "@/components/settings/settingsFields";
import { SuppliersPanel } from "@/components/settings/SuppliersPanel";
import { UnitsPanel } from "@/components/settings/UnitsPanel";
import { buttonClasses } from "@/components/ui/button";
import { Card, PageHeader, SectionHeading, SettingsRow } from "@/components/ui/display";
import { SettingsLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
import { prisma } from "@/lib/db";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";

export const metadata = { title: "Inventory settings" };

const TABS = [
  { key: "inventory", label: "Stock rules" },
  { key: "categories", label: "Categories" },
  { key: "units", label: "Units" },
  { key: "suppliers", label: "Suppliers" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function pickTab(raw: string | string[] | undefined): Tab {
  return TABS.find((tab) => tab.key === raw)?.key ?? "inventory";
}

async function loadTab(spaceId: string, tab: Tab) {
  if (tab === "categories") {
    const rows = await prisma.category.findMany({
      where: { spaceId, archivedAt: null },
      select: { id: true, parentId: true, name: true, description: true, loanDays: true, depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true, _count: { select: { items: true } } },
      take: 1000,
    });
    return { categories: rows.map(({ _count, ...row }) => ({ ...row, items: _count.items })) };
  }
  if (tab === "units") {
    const rows = await prisma.unit.findMany({ where: { spaceId }, select: { id: true, name: true, symbol: true, _count: { select: { items: true } } }, orderBy: { name: "asc" }, take: 500 });
    return { units: rows.map(({ _count, ...row }) => ({ ...row, items: _count.items })) };
  }
  if (tab === "suppliers") {
    const rows = await prisma.supplier.findMany({
      where: { spaceId },
      select: { id: true, name: true, email: true, phone: true, website: true, notes: true, archivedAt: true, _count: { select: { items: true } } },
      orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
      take: 500,
    });
    return { suppliers: rows.map(({ _count, archivedAt, ...row }) => ({ ...row, items: _count.items, archived: archivedAt !== null })) };
  }
  return {};
}

export default async function InventorySettingsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/settings/inventory">) {
  const { spaceSlug } = await params;
  const { tab: rawTab } = await searchParams;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const tab = pickTab(rawTab);
  const data = await loadTab(space.id, tab);
  const slug = space.slug;
  const base = `/s/${slug}/settings/inventory`;
  const tabs = TABS.map((item) => ({ href: item.key === "inventory" ? base : `${base}?tab=${item.key}`, label: item.label, active: item.key === tab }));
  const minorDigits = currencyMinorDigits(space.currency);
  const inventoryValues = {
    internalTransferApproval: space.internalTransferApproval,
    labelSize: space.labelSize,
    labelShowName: space.labelShowName,
    labelShowLocation: space.labelShowLocation,
    defaultReorderPoint: space.defaultReorderPoint,
    countVarianceThreshold: space.countVarianceThreshold,
    repairRequestDays: space.repairRequestDays,
  };

  return (
    <SettingsLayout
      header={<PageHeader title="Inventory settings" description="Stock-room rules, categories, units and suppliers. Changes are recorded in the audit log." />}
      tabs={<NavTabs label="Inventory settings" items={tabs} />}
    >
      {tab === "inventory" ? (
        <div className="flex flex-col gap-4">
          <SectionHeading title="Stock rules" description={SECTION_DESCRIPTIONS.inventory} />
          <SectionForm slug={slug} section="inventory" values={inventoryValues} currency={space.currency} minorDigits={minorDigits} />
          <Card padding="lg">
            <SettingsRow title="Count schedules" description="Recurring cycle counts open on their own when they're due. Set them up with your counts.">
              <Link href={`/s/${slug}/counts`} className={buttonClasses({ variant: "secondary" })}>Open counts</Link>
            </SettingsRow>
          </Card>
        </div>
      ) : null}
      {tab === "categories" && data.categories ? <CategoriesPanel slug={slug} categories={data.categories} currency={space.currency} minorDigits={minorDigits} /> : null}
      {tab === "units" && data.units ? <UnitsPanel slug={slug} units={data.units} /> : null}
      {tab === "suppliers" && data.suppliers ? <SuppliersPanel slug={slug} suppliers={data.suppliers} /> : null}
    </SettingsLayout>
  );
}
