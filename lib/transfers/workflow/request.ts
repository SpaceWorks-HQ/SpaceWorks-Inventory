import "server-only";

import type { Tx } from "@/lib/db";
import { transferRef } from "@/lib/catalogue/references";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError } from "@/lib/domainError";
import { releaseHolds, reserve } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { ACTING_SIDE, type TransferAction } from "../policy";
import { lockTransfer, logTransferStep, transferUrl, type Actor, type LockedTransfer } from "./common";

export type TransferRequest = {
  sourceSpaceId: string;
  destSpaceId: string;
  sourceLocationId: string;
  destLocationId: string | null;
  /** The space whose staff raised it (source pushing, or destination pulling). */
  initiatedBySpaceId: string;
  lines: { itemId: string; quantity: number }[];
  reason: string | null;
  neededBy: Date | null;
};

/** The acting space must be the side that performs this step (both sides may cancel). */
export function assertSide(transfer: { sourceSpaceId: string; destSpaceId: string }, action: TransferAction, actingSpaceId: string) {
  const side = ACTING_SIDE[action];
  const ok = side === "either" ? actingSpaceId === transfer.sourceSpaceId || actingSpaceId === transfer.destSpaceId
    : actingSpaceId === (side === "source" ? transfer.sourceSpaceId : transfer.destSpaceId);
  if (!ok) throw new DomainError(side === "source" ? "The sending space does this step." : "The receiving space does this step.", "forbidden");
}

/**
 * Raise a transfer. Inside one space it moves stock between two locations;
 * between spaces the receiving space must accept transfers, and a pull
 * request from the destination needs the source to share its stock list.
 */
export async function requestTransfer(tx: Tx, input: TransferRequest, actor: Actor) {
  const between = input.sourceSpaceId !== input.destSpaceId;
  if (![input.sourceSpaceId, input.destSpaceId].includes(input.initiatedBySpaceId)) throw new DomainError("Transfers are raised by the sending or the receiving space.", "forbidden");
  const [source, dest] = await Promise.all([
    tx.space.findFirst({ where: { id: input.sourceSpaceId, archivedAt: null } }),
    tx.space.findFirst({ where: { id: input.destSpaceId, archivedAt: null } }),
  ]);
  if (!source || !dest) throw new DomainError("That space wasn't found.", "not_found");
  if (between && !dest.acceptsTransfers) throw new DomainError(`${dest.name} doesn't accept transfers from other spaces.`, "forbidden");
  if (between && input.initiatedBySpaceId === dest.id && !source.shareStockWithSpaces) throw new DomainError(`${source.name} doesn't share its stock with other spaces.`, "forbidden");
  if (!between && !input.destLocationId) throw new DomainError("Choose where the stock goes.", "invalid");
  if (!between && input.destLocationId === input.sourceLocationId) throw new DomainError("Choose a different destination location.", "invalid");
  if (!(await tx.location.findFirst({ where: { id: input.sourceLocationId, spaceId: source.id, archivedAt: null }, select: { id: true } }))) throw new DomainError("That source location wasn't found.", "not_found");
  if (input.destLocationId && !(await tx.location.findFirst({ where: { id: input.destLocationId, spaceId: dest.id, archivedAt: null }, select: { id: true } }))) throw new DomainError("That destination location wasn't found.", "not_found");
  if (input.lines.length === 0 || input.lines.length > 100) throw new DomainError("Add between 1 and 100 items.", "invalid");
  const ids = input.lines.map((line) => line.itemId);
  if (new Set(ids).size !== ids.length) throw new DomainError("List each item once with its quantity.", "invalid");
  if (input.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 100_000)) throw new DomainError("Quantities must be whole numbers above zero.", "invalid");
  if ((await tx.item.count({ where: { id: { in: ids }, spaceId: source.id, archivedAt: null } })) !== ids.length) throw new DomainError("One of those items isn't in the sending space.", "not_found");
  const number = await nextSpaceSequence(tx, source.id, "transfer");
  const transfer = await tx.transfer.create({
    data: {
      number, sourceSpaceId: source.id, destSpaceId: dest.id, sourceLocationId: input.sourceLocationId, destLocationId: input.destLocationId,
      initiatedBySpaceId: input.initiatedBySpaceId, reason: input.reason, neededBy: input.neededBy, requestedById: actor.userId,
      lines: { create: input.lines.map((line) => ({ itemId: line.itemId, quantityRequested: line.quantity, destItemId: between ? null : line.itemId })) },
    },
  });
  await logTransferStep(tx, transfer, { type: "requested", event: "transfer.requested", spaceId: input.initiatedBySpaceId, actor, note: input.reason, metadata: { lines: input.lines.length, betweenSpaces: between }, status: "REQUESTED" });
  if (!between && !source.internalTransferApproval) {
    await approveTransfer(tx, { transferId: transfer.id, actingSpaceId: source.id, quantities: null }, { userId: null });
  } else {
    await notifyUsers(tx, source.id, await staffIds(tx, source.id, ["MANAGER"]), { kind: "transfer.requested", title: `Transfer ${transferRef(number)} needs approval`, body: between ? `${dest.name} ← ${source.name}` : null, url: transferUrl(source.slug, transfer.id) }, { excludeUserId: actor.userId });
  }
  return transfer;
}

/** Approve some or all quantities: holds the stock at the source location. */
export async function approveTransfer(tx: Tx, input: { transferId: string; actingSpaceId: string; quantities: Record<string, number> | null }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "approve");
  assertSide(transfer, "approve", input.actingSpaceId);
  let total = 0;
  for (const line of transfer.lines) {
    const quantity = input.quantities === null ? line.quantityRequested : input.quantities[line.id] ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.quantityRequested) throw new DomainError(`Approve between 0 and ${line.quantityRequested} of ${line.item.name}.`, "invalid");
    if (quantity === 0) continue;
    await reserve(tx, { spaceId: transfer.sourceSpaceId, itemId: line.itemId, quantity, locationId: transfer.sourceLocationId, owner: { transferLineId: line.id } }, actor, { refType: "Transfer", refId: transfer.id });
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityApproved: quantity } });
    total += quantity;
  }
  if (total === 0) throw new DomainError("Approve at least one unit, or reject the transfer instead.", "invalid");
  await tx.transfer.update({ where: { id: transfer.id }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
  await logTransferStep(tx, transfer, { type: "approved", event: "transfer.approved", spaceId: transfer.sourceSpaceId, actor, metadata: { units: total, automatic: actor.userId === null }, status: "APPROVED" });
  await notifyUsers(tx, transfer.sourceSpaceId, await staffIds(tx, transfer.sourceSpaceId), { kind: "transfer.approved", title: `Pick and dispatch ${transferRef(transfer.number)}`, url: transferUrl(transfer.sourceSpace.slug, transfer.id) }, { excludeUserId: actor.userId });
}

export async function rejectTransfer(tx: Tx, input: { transferId: string; actingSpaceId: string; reason: string }, actor: Actor) {
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Give a short reason.", "invalid");
  const transfer = await lockTransfer(tx, input.transferId, "reject");
  assertSide(transfer, "reject", input.actingSpaceId);
  await tx.transfer.update({ where: { id: transfer.id }, data: { status: "REJECTED", rejectedById: actor.userId, rejectedAt: new Date(), rejectionReason: reason.slice(0, 500) } });
  await logTransferStep(tx, transfer, { type: "rejected", event: "transfer.rejected", spaceId: transfer.sourceSpaceId, actor, note: reason, status: "REJECTED" });
  await notifyRequester(tx, transfer, `${transferRef(transfer.number)} was rejected`, reason);
}

/** Before dispatch either side may cancel; holds are released. */
export async function cancelTransfer(tx: Tx, input: { transferId: string; actingSpaceId: string; reason: string | null }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "cancel");
  assertSide(transfer, "cancel", input.actingSpaceId);
  for (const line of transfer.lines) {
    await releaseHolds(tx, { spaceId: transfer.sourceSpaceId, itemId: line.itemId, owner: { transferLineId: line.id } }, actor, { refType: "Transfer", refId: transfer.id });
  }
  await tx.transfer.update({ where: { id: transfer.id }, data: { status: "CANCELLED", cancelledById: actor.userId, cancelledAt: new Date(), cancelReason: input.reason?.slice(0, 500) ?? null } });
  await logTransferStep(tx, transfer, { type: "cancelled", event: "transfer.cancelled", spaceId: input.actingSpaceId, actor, note: input.reason, status: "CANCELLED" });
  await notifyRequester(tx, transfer, `${transferRef(transfer.number)} was cancelled`, input.reason);
}

async function notifyRequester(tx: Tx, transfer: LockedTransfer, title: string, body: string | null) {
  if (!transfer.requestedById) return;
  const slug = transfer.initiatedBySpaceId === transfer.destSpaceId ? transfer.destSpace.slug : transfer.sourceSpace.slug;
  await notifyUsers(tx, transfer.initiatedBySpaceId, [transfer.requestedById], { kind: "transfer.update", title, body, url: transferUrl(slug, transfer.id) });
}
