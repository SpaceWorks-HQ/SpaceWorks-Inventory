import "server-only";

import type { Tx } from "@/lib/db";
import { transferRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { bringBackAsset, putBack, recordLossWhileOut } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { inTransit, statusAfterDispatch } from "../policy";
import { assertSide } from "./request";
import { lockTransfer, logTransferStep, matchTransferScans, transferUrl, type Actor, type LockedTransfer } from "./common";
import { destinationItem } from "./mapping";

export type ReceiveLine = { lineId: string; received: number; damaged: number };

async function finish(tx: Tx, transfer: LockedTransfer, extra: Record<string, unknown> = {}) {
  const lines = await tx.transferLine.findMany({ where: { transferId: transfer.id } });
  const status = statusAfterDispatch(lines);
  const done = status === "RECEIVED" || status === "RETURNED";
  await tx.transfer.update({ where: { id: transfer.id }, data: { status, ...(done && status === "RECEIVED" ? { receivedAt: new Date() } : {}), ...(status === "RETURNED" ? { returnedAt: new Date() } : {}), ...extra } });
  return status;
}

/**
 * The destination receives what arrived, in one go or in parts. Quantity
 * lines need their label scanned; serialized units are received by scanning
 * each asset tag (unscanned tags stay in transit). Damaged units go to the
 * repair shelf and need a remark. Between spaces, units join the matching
 * (or a newly created) item in the receiving catalogue.
 */
export async function receiveTransfer(tx: Tx, input: { transferId: string; actingSpaceId: string; destLocationId: string | null; lines: ReceiveLine[]; damagedAssetIds?: string[]; scannedCodes: string[]; evidence: EvidenceInput }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "receive");
  assertSide(transfer, "receive", input.actingSpaceId);
  const destLocationId = input.destLocationId ?? transfer.destLocationId;
  if (!destLocationId || !(await tx.location.findFirst({ where: { id: destLocationId, spaceId: transfer.destSpaceId, archivedAt: null }, select: { id: true } }))) throw new DomainError("Choose where the stock goes in your space.", "invalid");
  const scans = matchTransferScans(transfer, input.scannedCodes);
  const damagedAssets = new Set(input.damagedAssetIds ?? []);
  const ref = { refType: "Transfer", refId: transfer.id };
  let received = 0;
  let damaged = 0;
  for (const line of transfer.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const arriving = line.assets.filter((a) => a.state === "DISPATCHED" && scans.assets.has(a.assetId));
      if (arriving.length === 0) continue;
      const itemId = await destinationItem(tx, transfer, line);
      let good = 0;
      let bad = 0;
      for (const entry of arriving) {
        const outcome = damagedAssets.has(entry.assetId) ? "damaged" : "returned";
        await bringBackAsset(tx, { assetId: entry.assetId, spaceId: transfer.destSpaceId, itemId, locationId: destLocationId, outcome, type: "TRANSFER_IN", expect: "IN_TRANSIT" }, actor, ref);
        await tx.transferLineAsset.update({ where: { id: entry.id }, data: { state: outcome === "damaged" ? "DAMAGED" : "RECEIVED" } });
        if (outcome === "damaged") bad += 1; else good += 1;
      }
      await tx.transferLine.update({ where: { id: line.id }, data: { quantityReceived: { increment: good }, quantityDamaged: { increment: bad } } });
      received += good;
      damaged += bad;
      continue;
    }
    const change = input.lines.find((l) => l.lineId === line.id);
    if (!change || change.received + change.damaged === 0) continue;
    if ([change.received, change.damaged].some((n) => !Number.isSafeInteger(n) || n < 0)) throw new DomainError("Quantities must be whole numbers.", "invalid");
    if (change.received + change.damaged > inTransit(line)) throw new DomainError(`Only ${inTransit(line)} of ${line.item.name} are still in transit.`, "invalid");
    if (!scans.items.has(line.itemId)) throw new DomainError(`Scan the label of ${line.item.name} as you unpack it.`, "invalid");
    const itemId = await destinationItem(tx, transfer, line);
    await putBack(tx, { spaceId: transfer.destSpaceId, itemId, locationId: destLocationId, good: change.received, damaged: change.damaged, type: "TRANSFER_IN" }, actor, ref);
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityReceived: { increment: change.received }, quantityDamaged: { increment: change.damaged } } });
    received += change.received;
    damaged += change.damaged;
  }
  if (received + damaged === 0) throw new DomainError("Receive at least one unit: enter quantities and scan the labels.", "invalid");
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId: transfer.destSpaceId, kind: "TRANSFER_RECEIPT", transferId: transfer.id, actorId: actor.userId, minPhotos: transfer.destSpace.minEvidencePhotos, remarksRequired: damaged > 0 });
  const status = await finish(tx, transfer, { destLocationId: transfer.destLocationId ?? destLocationId });
  await logTransferStep(tx, transfer, { type: "received", event: "transfer.received", spaceId: transfer.destSpaceId, actor, note: input.evidence.remarks || null, evidenceId: evidence.id, metadata: { received, damaged }, status });
  await notifyUsers(tx, transfer.sourceSpaceId, await staffIds(tx, transfer.sourceSpaceId, ["MANAGER"]), { kind: "transfer.received", title: `${transferRef(transfer.number)}: ${received + damaged} received${damaged ? `, ${damaged} damaged` : ""}`, url: transferUrl(transfer.sourceSpace.slug, transfer.id) });
  return { status, received, damaged };
}

/**
 * Close a discrepancy: units still in transit that will not arrive are
 * declared missing (serialized units become lost). Either side may do it.
 */
export async function declareMissing(tx: Tx, input: { transferId: string; actingSpaceId: string; lines: { lineId: string; missing: number }[]; missingAssetIds?: string[]; note: string }, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "missing");
  assertSide(transfer, "missing", input.actingSpaceId);
  const note = input.note.trim();
  if (!note) throw new DomainError("Note what happened to the missing units.", "invalid");
  const ref = { refType: "Transfer", refId: transfer.id, note };
  const missingAssets = new Set(input.missingAssetIds ?? []);
  let total = 0;
  for (const line of transfer.lines) {
    if (line.item.tracking === "SERIALIZED") {
      const lost = line.assets.filter((a) => a.state === "DISPATCHED" && missingAssets.has(a.assetId));
      for (const entry of lost) {
        await bringBackAsset(tx, { assetId: entry.assetId, spaceId: transfer.sourceSpaceId, itemId: line.itemId, locationId: transfer.sourceLocationId, outcome: "missing", type: "TRANSFER_IN", expect: "IN_TRANSIT" }, actor, ref);
        await tx.transferLineAsset.update({ where: { id: entry.id }, data: { state: "MISSING" } });
      }
      if (lost.length) await tx.transferLine.update({ where: { id: line.id }, data: { quantityMissing: { increment: lost.length } } });
      total += lost.length;
      continue;
    }
    const change = input.lines.find((l) => l.lineId === line.id);
    if (!change || change.missing === 0) continue;
    if (!Number.isSafeInteger(change.missing) || change.missing < 0 || change.missing > inTransit(line)) throw new DomainError(`Only ${inTransit(line)} of ${line.item.name} are still in transit.`, "invalid");
    await recordLossWhileOut(tx, { spaceId: transfer.sourceSpaceId, itemId: line.itemId, quantity: change.missing, type: "TRANSFER_LOSS", locationId: transfer.sourceLocationId }, actor, ref);
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityMissing: { increment: change.missing } } });
    total += change.missing;
  }
  if (total === 0) throw new DomainError("Choose the units that are missing.", "invalid");
  const status = await finish(tx, transfer);
  await logTransferStep(tx, transfer, { type: "missing_declared", spaceId: input.actingSpaceId, actor, note, metadata: { missing: total }, status });
  return { status };
}
