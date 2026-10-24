// Generated from app/s/[spaceSlug]/items/new/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { emptyItemValues } from "@/components/catalogue/itemFormModel";
import { prisma } from "@/lib/db";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
async function pickerOptions(spaceId: string) {
  const [categories, units, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.unit.findMany({ where: { spaceId }, select: { id: true, name: true, symbol: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { spaceId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    categories: categories.map((row) => ({ id: row.id, label: row.name })),
    units: units.map((row) => ({ id: row.id, label: `${row.name} (${row.symbol})` })),
    suppliers: suppliers.map((row) => ({ id: row.id, label: row.name })),
  };
}
export async function loadNewItemPage({ params }: PageProps<"/s/[spaceSlug]/items/new">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const options = await pickerOptions(space.id);
const initial = emptyItemValues();
const slug = space.slug;
const currency = space.currency;
const minorDigits = currencyMinorDigits(space.currency);
const categories = options.categories;
const units = options.units;
const suppliers = options.suppliers;
return viewDto({ initial, slug, currency, minorDigits, categories, units, suppliers } as const);
}
