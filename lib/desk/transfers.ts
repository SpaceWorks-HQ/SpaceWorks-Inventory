import "server-only";

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { inTransit, returningOut } from "@/lib/transfers/policy";
import { evidenceFor, namesOf } from "./evidence";
import { directionWhere, FILTER_STATUSES, sideOf, transferEventTitle } from "./transferLogic";
import type { TransferDirection, TransferFilter } from "./transferSchemas";

/** A transfer this space is a side of (source or destination), or a not-found refusal. */
export async function assertTransferInSpace(spaceId: string, transferId: string) {
  const transfer = await prisma.transfer.findFirst({ where: { id: transferId, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] }, select: { id: true } });
  if (!transfer) throw new DomainError("That transfer wasn't found.", "not_found");
}

/** One space's transfers, newest first, with the counterpart named. */
export async function listTransfers(spaceId: string, options: { direction: TransferDirection; filter: TransferFilter; take?: number }) {
  const statuses = FILTER_STATUSES[options.filter];
  const rows = await prisma.transfer.findMany({
    where: { ...directionWhere(spaceId, options.direction), ...(statuses ? { status: { in: [...statuses] } } : {}) },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 100,
    select: {
      id: true, number: true, status: true, sourceSpaceId: true, destSpaceId: true, neededBy: true, createdAt: true, expectedAt: true,
      sourceSpace: { select: { name: true } }, destSpace: { select: { name: true } },
      lines: { select: { quantityRequested: true } },
    },
  });
  return rows.map((row) => {
    const side = sideOf(row, spaceId)!;
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      side,
      counterpart: side === "both" ? "Inside this space" : side === "source" ? `To ${row.destSpace.name}` : `From ${row.sourceSpace.name}`,
      units: row.lines.reduce((sum, line) => sum + line.quantityRequested, 0),
      lineCount: row.lines.length,
      neededBy: row.neededBy,
      expectedAt: row.expectedAt,
      createdAt: row.createdAt,
    };
  });
}

export type TransferListRow = Awaited<ReturnType<typeof listTransfers>>[number];

/**
 * Everything the transfer page shows, from one side. The other side's
 * locations are named only to the side they belong to. Null when this space
 * isn't a side of the transfer.
 */
export async function transferDetail(slug: string, spaceId: string, transferId: string) {
  const transfer = await prisma.transfer.findFirst({
    where: { id: transferId, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] },
    include: {
      sourceSpace: { select: { id: true, slug: true, name: true, minEvidencePhotos: true } },
      destSpace: { select: { id: true, slug: true, name: true, minEvidencePhotos: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          item: { select: { id: true, name: true, sku: true, tracking: true, qrCode: true, unit: { select: { symbol: true } } } },
          assets: { include: { asset: { select: { id: true, assetTag: true, qrCode: true, status: true } } } },
        },
      },
      events: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!transfer) return null;
  const side = sideOf(transfer, spaceId)!;
  const seesSource = side !== "destination";
  const seesDest = side !== "source";
  const locationIds = [seesSource ? transfer.sourceLocationId : null, seesDest ? transfer.destLocationId : null].filter((value): value is string => Boolean(value));
  const locations = await prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, name: true, code: true } });
  const locationName = (id: string | null) => {
    const found = locations.find((location) => location.id === id);
    return found ? `${found.name} (${found.code})` : null;
  };
  const people = await namesOf([transfer.requestedById, ...transfer.events.map((event) => event.actorId)]);
  const spaceName = (id: string) => (id === transfer.sourceSpaceId ? transfer.sourceSpace.name : transfer.destSpace.name);
  const lines = transfer.lines.map((line) => ({
    id: line.id,
    itemId: line.item.id,
    itemName: line.item.name,
    sku: line.item.sku,
    tracking: line.item.tracking,
    itemCode: line.item.qrCode,
    unit: line.item.unit?.symbol ?? null,
    requested: line.quantityRequested,
    approved: line.quantityApproved,
    dispatched: line.quantityDispatched,
    received: line.quantityReceived,
    damaged: line.quantityDamaged,
    missing: line.quantityMissing,
    returning: line.quantityReturning,
    returned: line.quantityReturned,
    inTransit: inTransit(line),
    comingBack: returningOut(line),
    assets: line.assets.map((entry) => ({ id: entry.assetId, tag: entry.asset.assetTag, code: entry.asset.qrCode, state: entry.state })),
  }));
  return {
    id: transfer.id,
    number: transfer.number,
    status: transfer.status,
    side,
    betweenSpaces: transfer.sourceSpaceId !== transfer.destSpaceId,
    source: { id: transfer.sourceSpace.id, slug: transfer.sourceSpace.slug, name: transfer.sourceSpace.name, minPhotos: transfer.sourceSpace.minEvidencePhotos },
    dest: { id: transfer.destSpace.id, slug: transfer.destSpace.slug, name: transfer.destSpace.name, minPhotos: transfer.destSpace.minEvidencePhotos },
    sourceLocation: seesSource ? locationName(transfer.sourceLocationId) : null,
    sourceLocationId: seesSource ? transfer.sourceLocationId : null,
    destLocation: seesDest ? locationName(transfer.destLocationId) : null,
    destLocationId: seesDest ? transfer.destLocationId : null,
    initiatedBy: spaceName(transfer.initiatedBySpaceId),
    requestedBy: transfer.requestedById ? people.get(transfer.requestedById) ?? "Someone" : "Space Works",
    reason: transfer.reason,
    neededBy: transfer.neededBy,
    carrier: transfer.carrier,
    trackingRef: transfer.trackingRef,
    expectedAt: transfer.expectedAt,
    rejectionReason: transfer.rejectionReason,
    cancelReason: transfer.cancelReason,
    returnReason: transfer.returnReason,
    createdAt: transfer.createdAt,
    lines,
    events: transfer.events.map((event) => ({
      id: event.id,
      title: transferEventTitle(event.type, event.metadata),
      detail: event.note,
      actorName: event.actorId ? people.get(event.actorId) ?? "Someone" : "Space Works",
      spaceName: spaceName(event.spaceId),
      createdAt: event.createdAt,
    })),
    evidence: await evidenceFor(slug, { transferId: transfer.id }),
  };
}

export type TransferDetail = NonNullable<Awaited<ReturnType<typeof transferDetail>>>;

/** Serialized units the source can pick for a line (free or held at the source), code → label, for the dispatch scanner. */
export async function pickableAssets(spaceId: string, itemIds: string[]) {
  if (itemIds.length === 0) return [];
  return prisma.asset.findMany({
    where: { spaceId, itemId: { in: itemIds }, status: { in: ["AVAILABLE", "RESERVED"] } },
    select: { id: true, itemId: true, assetTag: true, qrCode: true, item: { select: { name: true } } },
    orderBy: { assetTag: "asc" },
    take: 500,
  });
}
