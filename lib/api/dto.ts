import type { AssetCondition, AssetStatus, BorrowingStatus, LoanStatus, LocationKind, RentalMode, SpaceRole, TrackingMode, TransferStatus } from "@prisma/client";
import { loanRef, transferRef } from "@/lib/catalogue/references";

/**
 * Minimal, stable API shapes (pure). Never emails, phone numbers, remarks,
 * evidence or secrets; people appear by name and membership id only.
 * Dates are ISO strings, money integer minor units in the space currency.
 */

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : null);

export type Availability = { onHand: number; reserved: number; quarantined: number; available: number; onLoan: number; inTransit: number };

export type ItemRow = {
  id: string; sku: string; name: string; description: string | null; tracking: TrackingMode; barcode: string | null; brand: string | null; model: string | null; tags: string[];
  unitCostMinor: number; avgCostMinor: number; reorderPoint: number | null; reorderQuantity: number | null;
  lendable: boolean; consumable: boolean; selfCheckout: boolean; requiresApproval: boolean; loanDays: number | null;
  depositMinor: number | null; rentalMode: RentalMode | null; rentalMinor: number | null; lateFeePerDayMinor: number | null; replacementMinor: number | null;
  archivedAt: Date | null; createdAt: Date; updatedAt: Date;
  category: { id: string; name: string } | null;
  unit: { id: string; name: string; symbol: string } | null;
  supplier: { id: string; name: string } | null;
};

export function itemDto(item: ItemRow, availability?: Availability) {
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    tracking: item.tracking,
    barcode: item.barcode,
    brand: item.brand,
    model: item.model,
    tags: item.tags,
    category: item.category ? { id: item.category.id, name: item.category.name } : null,
    unit: item.unit ? { id: item.unit.id, name: item.unit.name, symbol: item.unit.symbol } : null,
    supplier: item.supplier ? { id: item.supplier.id, name: item.supplier.name } : null,
    unitCostMinor: item.unitCostMinor,
    avgCostMinor: item.avgCostMinor,
    reorderPoint: item.reorderPoint,
    reorderQuantity: item.reorderQuantity,
    lending: {
      lendable: item.lendable,
      consumable: item.consumable,
      selfCheckout: item.selfCheckout,
      requiresApproval: item.requiresApproval,
      loanDays: item.loanDays,
      depositMinor: item.depositMinor,
      rentalMode: item.rentalMode,
      rentalMinor: item.rentalMinor,
      lateFeePerDayMinor: item.lateFeePerDayMinor,
      replacementMinor: item.replacementMinor,
    },
    archived: item.archivedAt !== null,
    ...(availability ? { availability } : {}),
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

export const ITEM_SELECT = {
  id: true, sku: true, name: true, description: true, tracking: true, barcode: true, brand: true, model: true, tags: true,
  unitCostMinor: true, avgCostMinor: true, reorderPoint: true, reorderQuantity: true,
  lendable: true, consumable: true, selfCheckout: true, requiresApproval: true, loanDays: true,
  depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true, replacementMinor: true,
  archivedAt: true, createdAt: true, updatedAt: true,
  category: { select: { id: true, name: true } },
  unit: { select: { id: true, name: true, symbol: true } },
  supplier: { select: { id: true, name: true } },
} as const;

export function locationDto(location: { id: string; parentId: string | null; kind: LocationKind; name: string; code: string; description: string | null; archivedAt: Date | null }) {
  return { id: location.id, parentId: location.parentId, kind: location.kind, name: location.name, code: location.code, description: location.description, archived: location.archivedAt !== null };
}

export function assetDto(asset: { id: string; itemId: string; assetTag: string; serialNumber: string | null; status: AssetStatus; condition: AssetCondition; locationId: string | null; purchasedAt: Date | null; warrantyUntil: Date | null; createdAt: Date }) {
  return {
    id: asset.id,
    itemId: asset.itemId,
    assetTag: asset.assetTag,
    serialNumber: asset.serialNumber,
    status: asset.status,
    condition: asset.condition,
    locationId: asset.locationId,
    purchasedAt: iso(asset.purchasedAt),
    warrantyUntil: iso(asset.warrantyUntil),
    createdAt: iso(asset.createdAt),
  };
}

type LoanLineRow = { id: string; itemId: string; assetId: string | null; quantityRequested: number; quantityApproved: number; quantityIssued: number; quantityReturned: number; quantityDamaged: number; quantityLost: number; quantityConsumed: number };

export type LoanRow = {
  id: string; number: number; status: LoanStatus; selfCheckout: boolean; dueAt: Date; neededFrom: Date | null; renewalCount: number;
  approvedAt: Date | null; issuedAt: Date | null; returnedAt: Date | null; cancelledAt: Date | null; rejectedAt: Date | null; createdAt: Date;
  borrower: { name: string | null; memberships: { id: string }[] };
  lines: LoanLineRow[];
};

export function loanDto(loan: LoanRow, now = new Date()) {
  return {
    id: loan.id,
    reference: loanRef(loan.number),
    number: loan.number,
    status: loan.status,
    overdue: (loan.status === "ISSUED" || loan.status === "PARTIALLY_RETURNED") && loan.dueAt < now,
    selfCheckout: loan.selfCheckout,
    borrower: { membershipId: loan.borrower.memberships[0]?.id ?? null, name: loan.borrower.name },
    dueAt: iso(loan.dueAt),
    neededFrom: iso(loan.neededFrom),
    renewalCount: loan.renewalCount,
    approvedAt: iso(loan.approvedAt),
    issuedAt: iso(loan.issuedAt),
    returnedAt: iso(loan.returnedAt),
    rejectedAt: iso(loan.rejectedAt),
    cancelledAt: iso(loan.cancelledAt),
    createdAt: iso(loan.createdAt),
    lines: loan.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      assetId: line.assetId,
      quantityRequested: line.quantityRequested,
      quantityApproved: line.quantityApproved,
      quantityIssued: line.quantityIssued,
      quantityReturned: line.quantityReturned,
      quantityDamaged: line.quantityDamaged,
      quantityLost: line.quantityLost,
      quantityConsumed: line.quantityConsumed,
    })),
  };
}

/** Prisma select for a loan DTO; the borrower's membership is looked up in this space only. */
export function loanSelect(spaceId: string) {
  return {
    id: true, number: true, status: true, selfCheckout: true, dueAt: true, neededFrom: true, renewalCount: true,
    approvedAt: true, issuedAt: true, returnedAt: true, cancelledAt: true, rejectedAt: true, createdAt: true,
    borrower: { select: { name: true, memberships: { where: { spaceId }, select: { id: true } } } },
    lines: { select: { id: true, itemId: true, assetId: true, quantityRequested: true, quantityApproved: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true }, orderBy: { id: "asc" as const } },
  } as const;
}

type TransferLineRow = { id: string; itemId: string; destItemId: string | null; quantityRequested: number; quantityApproved: number; quantityDispatched: number; quantityReceived: number; quantityDamaged: number; quantityMissing: number; quantityReturning: number; quantityReturned: number; item: { sku: string; name: string } };

export type TransferRow = {
  id: string; number: number; status: TransferStatus; sourceSpaceId: string; destSpaceId: string; sourceLocationId: string; destLocationId: string | null;
  neededBy: Date | null; approvedAt: Date | null; dispatchedAt: Date | null; receivedAt: Date | null; cancelledAt: Date | null; rejectedAt: Date | null; createdAt: Date;
  sourceSpace: { slug: string; name: string }; destSpace: { slug: string; name: string };
  lines: TransferLineRow[];
};

export function transferDto(transfer: TransferRow, viewerSpaceId: string) {
  const internal = transfer.sourceSpaceId === transfer.destSpaceId;
  return {
    id: transfer.id,
    reference: transferRef(transfer.number),
    number: transfer.number,
    status: transfer.status,
    direction: internal ? "internal" : transfer.sourceSpaceId === viewerSpaceId ? "out" : "in",
    source: { space: transfer.sourceSpace.slug, spaceName: transfer.sourceSpace.name, locationId: transfer.sourceLocationId },
    destination: { space: transfer.destSpace.slug, spaceName: transfer.destSpace.name, locationId: transfer.destLocationId },
    neededBy: iso(transfer.neededBy),
    approvedAt: iso(transfer.approvedAt),
    dispatchedAt: iso(transfer.dispatchedAt),
    receivedAt: iso(transfer.receivedAt),
    rejectedAt: iso(transfer.rejectedAt),
    cancelledAt: iso(transfer.cancelledAt),
    createdAt: iso(transfer.createdAt),
    lines: transfer.lines.map((line) => ({
      id: line.id,
      item: { id: line.itemId, sku: line.item.sku, name: line.item.name },
      destItemId: line.destItemId,
      quantityRequested: line.quantityRequested,
      quantityApproved: line.quantityApproved,
      quantityDispatched: line.quantityDispatched,
      quantityReceived: line.quantityReceived,
      quantityDamaged: line.quantityDamaged,
      quantityMissing: line.quantityMissing,
      quantityReturning: line.quantityReturning,
      quantityReturned: line.quantityReturned,
    })),
  };
}

export const TRANSFER_SELECT = {
  id: true, number: true, status: true, sourceSpaceId: true, destSpaceId: true, sourceLocationId: true, destLocationId: true,
  neededBy: true, approvedAt: true, dispatchedAt: true, receivedAt: true, cancelledAt: true, rejectedAt: true, createdAt: true,
  sourceSpace: { select: { slug: true, name: true } },
  destSpace: { select: { slug: true, name: true } },
  lines: {
    select: { id: true, itemId: true, destItemId: true, quantityRequested: true, quantityApproved: true, quantityDispatched: true, quantityReceived: true, quantityDamaged: true, quantityMissing: true, quantityReturning: true, quantityReturned: true, item: { select: { sku: true, name: true } } },
    orderBy: { id: "asc" as const },
  },
} as const;

/** Members: name and membership id only, plus role and borrowing standing. */
export function memberDto(membership: { id: string; role: SpaceRole; status: "ACTIVE" | "SUSPENDED"; borrowingStatus: BorrowingStatus; joinedAt: Date; user: { name: string | null } }) {
  return { id: membership.id, name: membership.user.name, role: membership.role, status: membership.status, borrowingStatus: membership.borrowingStatus, joinedAt: iso(membership.joinedAt) };
}
