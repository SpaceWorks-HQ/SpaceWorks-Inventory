import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddAssetsForm } from "@/components/catalogue/AddAssetsForm";
import { ItemDetailActions } from "@/components/catalogue/ItemDetailActions";
import { ItemPhotos } from "@/components/catalogue/ItemPhotos";
import { ItemAssetsTable, StockByLocation } from "@/components/catalogue/ItemStockTables";
import { QrPlate } from "@/components/catalogue/QrPlate";
import { RENTAL_MODE_LABEL } from "@/components/catalogue/words";
import { MovementsTable } from "@/components/stock/MovementsTable";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, DetailList, PageHeader, StatTile } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { itemImageUrl } from "@/lib/catalogue/images";
import { loadMovements, locationOptions, qrSvg } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format/datetime";
import { currencyMinorDigits, formatMoney } from "@/lib/format/money";
import { availabilityFor, availabilityOf, levelsForItem } from "@/lib/inventory/availability";
import { canAdjustStock, canManageCatalogue, requireSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Item" };

function money(minor: number | null, currency: string, fallback: string) {
  return minor === null ? fallback : formatMoney(minor, currency);
}

export default async function ItemPage({ params }: PageProps<"/s/[spaceSlug]/items/[itemId]">) {
  const { spaceSlug, itemId } = await params;
  const { space, membership } = await requireSpace(spaceSlug, "STAFF");
  const item = await prisma.item.findFirst({
    where: { id: itemId, spaceId: space.id },
    include: { category: { select: { name: true } }, unit: { select: { symbol: true } }, supplier: { select: { name: true } }, images: { select: { id: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!item) notFound();
  const slug = space.slug;
  const currency = space.currency;
  const minorDigits = currencyMinorDigits(currency);
  const totals = availabilityOf(await availabilityFor(space.id, [item.id]), item.id);
  const levelRows = (await levelsForItem(space.id, item.id)).map((level) => ({
    locationId: level.locationId, location: `${level.location.name} (${level.location.code})`, onHand: level.onHand, reserved: level.reserved, quarantined: level.quarantined,
    available: level.onHand - level.reserved - level.quarantined,
  }));
  const levels = levelRows.map((row) => ({ locationId: row.locationId, label: row.location, onHand: row.onHand, available: row.available, quarantined: row.quarantined }));
  const assets = item.tracking === "SERIALIZED"
    ? (await prisma.asset.findMany({ where: { spaceId: space.id, itemId: item.id }, select: { id: true, assetTag: true, serialNumber: true, status: true, condition: true, location: { select: { name: true, code: true } } }, orderBy: { assetTag: "asc" }, take: 200 }))
      .map((asset) => ({ id: asset.id, assetTag: asset.assetTag, serialNumber: asset.serialNumber, status: asset.status, condition: asset.condition, location: asset.location ? `${asset.location.name} (${asset.location.code})` : null }))
    : [];
  const movements = (await loadMovements(space.id, slug, { spaceId: space.id, itemId: item.id }, { take: 15 })).map((row) => ({ ...row, when: formatRelativeTime(row.createdAt, space.timezone) }));
  const locations = await locationOptions(space.id);
  const qr = await qrSvg(item.qrCode);
  const canEdit = canManageCatalogue(membership);
  const canAdjust = canAdjustStock(membership);
  const unit = item.unit?.symbol ?? null;
  const photos = item.images.map((image) => ({ id: image.id, url: itemImageUrl(slug, image.id) }));
  const low = item.reorderPoint !== null && totals.available <= item.reorderPoint;
  const archived = item.archivedAt !== null;
  const facts = [
    { label: "SKU", value: item.sku },
    { label: "Category", value: item.category?.name ?? "None" },
    { label: "Unit", value: unit ?? "None" },
    { label: "Supplier", value: item.supplier?.name ?? "None" },
    { label: "Barcode", value: item.barcode ?? "None" },
    { label: "Brand and model", value: [item.brand, item.model].filter(Boolean).join(" ") || "None" },
    { label: "Tags", value: item.tags.join(", ") || "None" },
    { label: "Unit cost", value: formatMoney(item.unitCostMinor, currency) },
    { label: "Average cost", value: formatMoney(item.avgCostMinor, currency) },
    { label: "Replacement", value: money(item.replacementMinor, currency, "Unit cost") },
    { label: "Reorder at", value: item.reorderPoint === null ? "Off" : `${item.reorderPoint}${item.reorderQuantity ? `, order ${item.reorderQuantity}` : ""}` },
  ];
  const lending = item.lendable ? [
    { label: "Loan length", value: item.loanDays ? `${item.loanDays} days` : "Default" },
    { label: "Deposit", value: money(item.depositMinor, currency, "Default") },
    { label: "Rental", value: item.rentalMode ? `${RENTAL_MODE_LABEL[item.rentalMode]}${item.rentalMode !== "FREE" && item.rentalMinor !== null ? `, ${formatMoney(item.rentalMinor, currency)}` : ""}` : "Default" },
    { label: "Late fee per day", value: money(item.lateFeePerDayMinor, currency, "Default") },
    { label: "Approval", value: item.requiresApproval ? "Needed" : "Not needed" },
    { label: "Self-checkout", value: item.selfCheckout ? "Allowed" : "Off" },
  ] : [];
  const stats = [
    { label: "On hand", value: totals.onHand },
    { label: "Available", value: totals.available },
    { label: "On loan", value: totals.onLoan },
    { label: "In transit", value: totals.inTransit },
  ];
  const value = formatMoney(totals.onHand * item.avgCostMinor, currency);
  const header = { name: item.name, sku: item.sku, tracking: item.tracking, lendable: item.lendable, consumable: item.consumable, notes: item.notes, description: item.description };
  const id = item.id;
  const labelHref = `/s/${slug}/labels/print?kind=items&ids=${encodeURIComponent(id)}`;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/items`, label: "Items" }}
      header={
        <PageHeader
          kicker={header.sku}
          title={header.name}
          description={header.description ?? undefined}
          actions={<ItemDetailActions slug={slug} itemId={id} tracking={header.tracking} archived={archived} canEdit={canEdit} canAdjust={canAdjust} unit={unit} currency={currency} minorDigits={minorDigits} locations={locations} levels={levels} />}
        />
      }
      aside={
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="QR label" description="Scanning it opens this item." />
            <QrPlate svg={qr} label={`QR code for ${header.name}`} />
            <Button asChild variant="secondary" className="mt-4" fullWidth><a href={labelHref} target="_blank" rel="noopener">Print label</a></Button>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <DetailList items={facts} />
          </Card>
          {lending.length > 0 ? (
            <Card>
              <CardHeader title="Lending" description="Default means the category, then the space setting." />
              <DetailList items={lending} />
            </Card>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap gap-2">
          <Chip tone="info">{header.tracking === "SERIALIZED" ? "Serialized" : "By quantity"}</Chip>
          {header.lendable ? <Chip tone="accent">Lendable</Chip> : <Chip tone="outline">Not lendable</Chip>}
          {header.consumable ? <Chip tone="neutral">Consumable</Chip> : null}
          {low ? <Chip tone="warning">Low stock</Chip> : null}
          {archived ? <Chip tone="outline">Archived</Chip> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map((stat) => <StatTile key={stat.label} label={stat.label} value={unit ? `${stat.value} ${unit}` : stat.value} />)}
          <StatTile label="Value" value={value} hint="On hand at average cost" className="col-span-2 lg:col-span-1" />
        </div>
        <ItemPhotos slug={slug} itemId={id} name={header.name} photos={photos} canEdit={canEdit} />
        <Card>
          <CardHeader title="Stock by location" />
          <StockByLocation rows={levelRows} unit={unit} />
        </Card>
        {header.tracking === "SERIALIZED" ? (
          <Card id="add-assets">
            <CardHeader title="Assets" description="Each unit has its own tag and QR code." />
            <ItemAssetsTable slug={slug} rows={assets} />
            {canEdit && !archived ? (
              <div className="mt-6 border-t border-line pt-6">
                <h3 className="mb-4 text-title text-ink">Register units</h3>
                <AddAssetsForm slug={slug} itemId={id} locations={locations} currency={currency} minorDigits={minorDigits} />
              </div>
            ) : null}
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Recent movements" action={<Button asChild variant="ghost" size="sm"><Link href={`/s/${slug}/stock/movements?item=${encodeURIComponent(id)}`}>Full ledger</Link></Button>} />
          {movements.length === 0 ? <p className="text-body-ui text-ink-muted">No stock movements yet.</p> : <MovementsTable slug={slug} rows={movements} showItem={false} />}
        </Card>
        {header.notes ? (
          <Card>
            <CardHeader title="Notes" />
            <p className="whitespace-pre-wrap text-body-ui text-ink-secondary">{header.notes}</p>
          </Card>
        ) : null}
      </div>
    </DetailLayout>
  );
}
