// Generated from app/s/[spaceSlug]/items/[itemId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { RENTAL_MODE_LABEL } from "@/components/catalogue/words";
import { itemImageUrl } from "@/lib/catalogue/images";
import { loadMovements, locationOptions, qrSvg } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatRelativeTime } from "@/lib/format/datetime";
import { currencyMinorDigits, formatMoney } from "@/lib/format/money";
import { availabilityFor, availabilityOf, levelsForItem } from "@/lib/inventory/availability";
import { canAdjustStock, canManageCatalogue, requireSpace } from "@/lib/permissions";
function money(minor: number | null, currency: string, fallback: string) {
  return minor === null ? fallback : formatMoney(minor, currency);
}
export async function loadItemPage({ params }: PageProps<"/s/[spaceSlug]/items/[itemId]">) {
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
return viewDto({ slug, currency, minorDigits, levelRows, levels, assets, movements, locations, qr, canEdit, canAdjust, unit, photos, low, archived, facts, lending, stats, value, header, id, labelHref } as const);
}
