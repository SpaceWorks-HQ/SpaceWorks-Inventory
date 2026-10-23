// Generated from app/s/[spaceSlug]/assets/[assetId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { CONDITION_LABEL } from "@/components/catalogue/words";
import { loanRef, transferRef } from "@/lib/catalogue/references";
import { loadMovements, locationOptions, qrSvg } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { formatDate, formatRelativeTime } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { canAdjustStock, canManageCatalogue, requireSpace } from "@/lib/permissions";

export async function loadAssetPage({ params }: PageProps<"/s/[spaceSlug]/assets/[assetId]">) {
const { spaceSlug, assetId } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const asset = await prisma.asset.findFirst({
    where: { id: assetId, spaceId: space.id },
    include: { item: { select: { id: true, name: true, sku: true } }, location: { select: { name: true, code: true } } },
  });
if (!asset) notFound();
const tz = space.timezone;
const slug = space.slug;
const [loanLines, transferAssets, movementRows, locations, qr] = await Promise.all([
    prisma.loanLine.findMany({ where: { assetId: asset.id, loan: { spaceId: space.id } }, select: { loan: { select: { id: true, number: true, status: true, issuedAt: true, returnedAt: true, createdAt: true, borrower: { select: { name: true, email: true } } } } }, orderBy: { loan: { createdAt: "desc" } }, take: 50 }),
    prisma.transferLineAsset.findMany({ where: { assetId: asset.id, line: { transfer: { OR: [{ sourceSpaceId: space.id }, { destSpaceId: space.id }] } } }, select: { state: true, line: { select: { transfer: { select: { id: true, number: true, status: true, sourceSpace: { select: { name: true } }, destSpace: { select: { name: true } } } } } } }, take: 50 }),
    loadMovements(space.id, slug, { spaceId: space.id, assetId: asset.id }, { take: 25 }),
    locationOptions(space.id),
    qrSvg(asset.qrCode),
  ]);
const loans = loanLines.map(({ loan }) => ({ id: loan.id, ref: loanRef(loan.number), status: loan.status, borrower: loan.borrower.name ?? loan.borrower.email, issued: loan.issuedAt ? formatDate(loan.issuedAt, tz) : null, returned: loan.returnedAt ? formatDate(loan.returnedAt, tz) : null }));
const transfers = transferAssets.map(({ state, line: { transfer } }) => ({ id: transfer.id, ref: transferRef(transfer.number), status: transfer.status, state, route: transfer.sourceSpace.name === transfer.destSpace.name ? "Inside this space" : `${transfer.sourceSpace.name} to ${transfer.destSpace.name}` }));
const movements = movementRows.map((row) => ({ ...row, when: formatRelativeTime(row.createdAt, tz) }));
const facts = [
    { label: "Item", value: asset.item.name },
    { label: "Serial number", value: asset.serialNumber ?? "None" },
    { label: "Condition", value: CONDITION_LABEL[asset.condition] },
    { label: "Location", value: asset.location ? `${asset.location.name} (${asset.location.code})` : "Off the shelf" },
    { label: "Bought", value: asset.purchasedAt ? formatDate(asset.purchasedAt, tz) : "Unknown" },
    { label: "Cost", value: asset.purchaseCostMinor === null ? "Unknown" : formatMoney(asset.purchaseCostMinor, space.currency) },
    { label: "Warranty until", value: asset.warrantyUntil ? formatDate(asset.warrantyUntil, "UTC") : "None" },
  ];
const details = { serialNumber: asset.serialNumber ?? "", notes: asset.notes ?? "", warrantyUntil: asset.warrantyUntil ? asset.warrantyUntil.toISOString().slice(0, 10) : "", condition: asset.condition };
const header = { id: asset.id, tag: asset.assetTag, status: asset.status, itemId: asset.item.id, itemName: asset.item.name, locationId: asset.locationId, notes: asset.notes };
const labelHref = `/s/${slug}/labels/print?kind=assets&ids=${encodeURIComponent(asset.id)}`;
const canAdjust = canAdjustStock(membership);
const canEdit = canManageCatalogue(membership);
const locationList = locations.map((row) => ({ id: row.id, label: row.label }));
return viewDto({ slug, locations, qr, loans, transfers, movements, facts, details, header, labelHref, canAdjust, canEdit, locationList } as const);
}
