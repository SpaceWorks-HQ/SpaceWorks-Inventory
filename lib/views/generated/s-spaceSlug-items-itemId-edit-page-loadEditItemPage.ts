// Generated from app/s/[spaceSlug]/items/[itemId]/edit/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { itemValuesFrom } from "@/components/catalogue/itemFormModel";
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
export async function loadEditItemPage({ params }: PageProps<"/s/[spaceSlug]/items/[itemId]/edit">) {
const { spaceSlug, itemId } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const item = await prisma.item.findFirst({ where: { id: itemId, spaceId: space.id } });
if (!item) notFound();
const options = await pickerOptions(space.id);
const minorDigits = currencyMinorDigits(space.currency);
const initial = itemValuesFrom(item, minorDigits);
const trackingLocked = (await prisma.stockMovement.count({ where: { itemId: item.id } })) > 0;
const slug = space.slug;
const currency = space.currency;
const name = item.name;
const id = item.id;
const categories = options.categories;
const units = options.units;
const suppliers = options.suppliers;
return viewDto({ minorDigits, initial, trackingLocked, slug, currency, name, id, categories, units, suppliers } as const);
}
