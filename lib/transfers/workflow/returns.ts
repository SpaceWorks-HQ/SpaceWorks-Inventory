import "server-only";

import type { Tx } from "@/lib/db";
import { transferRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { bringBackAsset, putBack } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { inTransit, returningOut, statusAfterDispatch } from "../policy";
import { assertSide } from "./request";
import { lockTransfer, logTransferStep, matchTransferScans, transferUrl, type Actor } from "./common";

/**
 * Return to sender: the destination refuses units that are still in transit
 * (wrong items, refused delivery). They travel back and stay out of every
 * space's stock until the source receives them.
 */
export async function sendBack(tx: Tx, input: { transferId: string; actingSpaceId: string; lines: { lineId: string; quantity: number }[]; assetIds?: string[]; reason: string }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "sendBack");
  assertSide(transfer, "sendBack", input.actingSpaceId);
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Say why the units are going back.", "invalid");
  const assets = new Set(input.assetIds ?? []);
  let total = 0;
  for (const line of transfer.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const back = line.assets.filter((a) => a.state === "DISPATCHED" && assets.has(a.assetId));
      for (const entry of back) await tx.transferLineAsset.update({ where: { id: entry.id }, data: { state: "RETURNING" } });
      if (back.length) await tx.transferLine.update({ where: { id: line.id }, data: { quantityReturning: { increment: back.length } } });
      total += back.length;
      continue;
    }
    const change = input.lines.find((l) => l.lineId === line.id);
    if (!change || change.quantity === 0) continue;
    if (!Number.isSafeInteger(change.quantity) || change.quantity < 0 || change.quantity > inTransit(line)) throw new DomainError(`Only ${inTransit(line)} of ${line.item.name} are still in transit.`, "invalid");
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityReturning: { increment: change.quantity } } });
    total += change.quantity;
  }
  if (total === 0) throw new DomainError("Choose what goes back to the sender.", "invalid");
  const lines = await tx.transferLine.findMany({ where: { transferId: transfer.id } });
  const status = statusAfterDispatch(lines);
  await tx.transfer.update({ where: { id: transfer.id }, data: { status, returnReason: reason.slice(0, 500) } });
  await logTransferStep(tx, transfer, { type: "sent_back", event: "transfer.returned", spaceId: transfer.destSpaceId, actor, note: reason, metadata: { units: total, received: false }, status });
  await notifyUsers(tx, transfer.sourceSpaceId, await staffIds(tx, transfer.sourceSpaceId), { kind: "transfer.returning", title: `${total} ${total === 1 ? "unit" : "units"} of ${transferRef(transfer.number)} are coming back`, body: reason, url: transferUrl(transfer.sourceSpace.slug, transfer.id) });
  return { status };
}

/** The source takes returned units back onto a shelf (scan labels; photos as evidence). */
export async function receiveReturn(tx: Tx, input: { transferId: string; actingSpaceId: string; locationId: string | null; lines: { lineId: string; quantity: number }[]; scannedCodes: string[]; evidence: EvidenceInput }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "receiveReturn");
  assertSide(transfer, "receiveReturn", input.actingSpaceId);
  const locationId = input.locationId ?? transfer.sourceLocationId;
  if (!(await tx.location.findFirst({ where: { id: locationId, spaceId: transfer.sourceSpaceId, archivedAt: null }, select: { id: true } }))) throw new DomainError("Choose where the returned stock goes.", "invalid");
  const scans = matchTransferScans(transfer, input.scannedCodes);
  const ref = { refType: "Transfer", refId: transfer.id };
  let total = 0;
  for (const line of transfer.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const back = line.assets.filter((a) => a.state === "RETURNING" && scans.assets.has(a.assetId));
      for (const entry of back) {
        await bringBackAsset(tx, { assetId: entry.assetId, spaceId: transfer.sourceSpaceId, itemId: line.itemId, locationId, outcome: "returned", type: "TRANSFER_RETURN", expect: "IN_TRANSIT" }, actor, ref);
        await tx.transferLineAsset.update({ where: { id: entry.id }, data: { state: "RETURNED" } });
      }
      if (back.length) await tx.transferLine.update({ where: { id: line.id }, data: { quantityReturned: { increment: back.length } } });
      total += back.length;
      continue;
    }
    const change = input.lines.find((l) => l.lineId === line.id);
    if (!change || change.quantity === 0) continue;
    if (!Number.isSafeInteger(change.quantity) || change.quantity < 0 || change.quantity > returningOut(line)) throw new DomainError(`Only ${returningOut(line)} of ${line.item.name} are on their way back.`, "invalid");
    if (!scans.items.has(line.itemId)) throw new DomainError(`Scan the label of ${line.item.name}.`, "invalid");
    await putBack(tx, { spaceId: transfer.sourceSpaceId, itemId: line.itemId, locationId, good: change.quantity, damaged: 0, type: "TRANSFER_RETURN" }, actor, ref);
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityReturned: { increment: change.quantity } } });
    total += change.quantity;
  }
  if (total === 0) throw new DomainError("Receive at least one returned unit: enter quantities and scan the labels.", "invalid");
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId: transfer.sourceSpaceId, kind: "TRANSFER_RECEIPT", transferId: transfer.id, actorId: actor.userId, minPhotos: transfer.sourceSpace.minEvidencePhotos, remarksRequired: false });
  const lines = await tx.transferLine.findMany({ where: { transferId: transfer.id } });
  const status = statusAfterDispatch(lines);
  await tx.transfer.update({ where: { id: transfer.id }, data: { status, ...(status === "RETURNED" ? { returnedAt: new Date() } : {}), ...(status === "RECEIVED" ? { receivedAt: new Date() } : {}) } });
  await logTransferStep(tx, transfer, { type: "return_received", event: "transfer.returned", spaceId: transfer.sourceSpaceId, actor, evidenceId: evidence.id, metadata: { units: total, received: true }, status });
  return { status };
}
