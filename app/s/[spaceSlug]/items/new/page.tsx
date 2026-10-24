import type { Metadata } from "next";
import { ItemForm } from "@/components/catalogue/ItemForm";
import { emptyItemValues } from "@/components/catalogue/itemFormModel";
import { PageHeader } from "@/components/ui/display";
import { FormPageLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { currencyMinorDigits } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Add item" };

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

export default async function NewItemPage({ params }: PageProps<"/s/[spaceSlug]/items/new">) {
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

  return (
    <FormPageLayout header={<PageHeader kicker="Items" title="Add item" description="Add it once; receive stock or register its units afterwards." />}>
      <ItemForm slug={slug} itemId={null} initial={initial} currency={currency} minorDigits={minorDigits} categories={categories} units={units} suppliers={suppliers} trackingLocked={false} />
    </FormPageLayout>
  );
}
