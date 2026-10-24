import "server-only";

import type { Tx } from "@/lib/db";
import { transferRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { releaseHolds, takeAsset, takeFromHolds } from "@/lib/inventory/availability";
import { resolveScan } from "@/lib/catalogue/resolve";
import { extractQrCode } from "@/lib/catalogue/qr";
import { notifyUsers, staffIds } from "@/lib/notify";
import { assertSide } from "./request";
import { lockTransfer, logTransferStep, transferUrl, type Actor } from "./common";

export type DispatchInput = {
  transferId: string;
  actingSpaceId: string;
  /** Units per quantity line (defaults to the approved quantity). */
  quantities?: Record<string, number>;
  /** Pick-list scans: every quantity item's label and every serialized unit's asset tag. */
  scannedCodes: string[];
  carrier: string | null;
  trackingRef: string | null;
  expectedAt: Date | null;
  evidence: EvidenceInput;
};

/**
 * The source picks and sends. Quantity lines need their item label scanned;
 * serialized lines send exactly the assets scanned (at most the approved
 * count). Stock leaves the source now and is "in transit" until received;
 * any approved units not sent are released.
 */
export async function dispatchTransfer(tx: Tx, input: DispatchInput, actor: Actor) {
  const transfer = await lockTransfer(tx, input.transferId, "dispatch");
  assertSide(transfer, "dispatch", input.actingSpaceId);
  const spaceId = transfer.sourceSpaceId;
  const ref = { refType: "Transfer", refId: transfer.id };
  const items = new Set<string>();
  const assets = new Map<string, { itemId: string; label: string }>();
  for (const value of input.scannedCodes) {
    if (!value.trim()) continue;
    if (!extractQrCode(value)) throw new DomainError("One of the scans isn't a Space Works QR code. Scan the label again.", "invalid");
    const resolved = await resolveScan(spaceId, value, tx);
    if (!resolved) throw new DomainError(`Code ${extractQrCode(value)} isn't from this space.`, "invalid");
    if (resolved.kind === "item") items.add(resolved.itemId);
    else if (resolved.kind === "asset") assets.set(resolved.id, { itemId: resolved.itemId, label: resolved.label });
    else throw new DomainError(`${resolved.label} is a ${resolved.kind}; scan item and asset labels.`, "invalid");
  }
  let total = 0;
  for (const line of transfer.lines) {
    if (line.quantityApproved === 0) continue;
    if (line.item.tracking === "SERIALIZED") {
      const picked = [...assets.entries()].filter(([, asset]) => asset.itemId === line.itemId);
      if (picked.length > line.quantityApproved) throw new DomainError(`Only ${line.quantityApproved} ${line.item.name} were approved.`, "invalid");
      await releaseHolds(tx, { spaceId, itemId: line.itemId, owner: { transferLineId: line.id } }, actor, ref);
      for (const [assetId] of picked) {
        await takeAsset(tx, { spaceId, assetId, itemId: line.itemId, to: "IN_TRANSIT", type: "TRANSFER_OUT" }, actor, ref);
        await tx.transferLineAsset.create({ data: { lineId: line.id, assetId, state: "DISPATCHED" } });
        assets.delete(assetId);
      }
      await tx.transferLine.update({ where: { id: line.id }, data: { quantityDispatched: picked.length } });
      total += picked.length;
      continue;
    }
    const quantity = input.quantities?.[line.id] ?? line.quantityApproved;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.quantityApproved) throw new DomainError(`Send between 0 and ${line.quantityApproved} of ${line.item.name}.`, "invalid");
    if (quantity === 0) {
      await releaseHolds(tx, { spaceId, itemId: line.itemId, owner: { transferLineId: line.id } }, actor, ref);
      continue;
    }
    if (!items.has(line.itemId)) throw new DomainError(`Scan the label of ${line.item.name} as you pick it.`, "invalid");
    await takeFromHolds(tx, { spaceId, itemId: line.itemId, quantity, owner: { transferLineId: line.id }, type: "TRANSFER_OUT" }, actor, ref);
    await tx.transferLine.update({ where: { id: line.id }, data: { quantityDispatched: quantity } });
    total += quantity;
  }
  if (assets.size > 0) throw new DomainError(`${[...assets.values()][0]!.label} isn't on this transfer.`, "invalid");
  if (total === 0) throw new DomainError("Send at least one unit, or cancel the transfer instead.", "invalid");
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId, kind: "TRANSFER_DISPATCH", transferId: transfer.id, actorId: actor.userId, minPhotos: transfer.sourceSpace.minEvidencePhotos, remarksRequired: false });
  await tx.transfer.update({
    where: { id: transfer.id },
    data: { status: "DISPATCHED", dispatchedById: actor.userId, dispatchedAt: new Date(), carrier: input.carrier?.slice(0, 80) ?? null, trackingRef: input.trackingRef?.slice(0, 80) ?? null, expectedAt: input.expectedAt },
  });
  await logTransferStep(tx, transfer, { type: "dispatched", event: "transfer.dispatched", spaceId, actor, note: input.evidence.remarks || null, evidenceId: evidence.id, metadata: { units: total }, status: "DISPATCHED" });
  await notifyUsers(tx, transfer.destSpaceId, await staffIds(tx, transfer.destSpaceId), { kind: "transfer.dispatched", title: `${transferRef(transfer.number)} is on its way`, body: `${total} ${total === 1 ? "unit" : "units"}${input.carrier ? ` with ${input.carrier}` : ""}`, url: transferUrl(transfer.destSpace.slug, transfer.id) }, { excludeUserId: actor.userId });
}
