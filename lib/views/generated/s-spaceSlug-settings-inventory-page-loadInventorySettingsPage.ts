// Generated from app/s/[spaceSlug]/settings/inventory/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
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
export async function loadInventorySettingsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/settings/inventory">) {
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
  };
return viewDto({ space, tab, data, slug, tabs, minorDigits, inventoryValues } as const);
}
