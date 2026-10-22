import "server-only";

import type { Prisma, TransferStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { extractQrCode } from "@/lib/catalogue/qr";
import { transferRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import type { EventType } from "@/lib/events/catalogue";
import { canTransfer, TRANSFER_STATUS_LABEL, type TransferAction } from "../policy";

export type Actor = { userId: string | null; apiTokenId?: string | null };

/** Lock the transfer row, then re-read it with lines, items and assets. */
export async function lockTransfer(tx: Tx, transferId: string, action: TransferAction) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Transfer" WHERE "id" = ${transferId} FOR UPDATE`;
  if (!row) throw new DomainError("That transfer wasn't found.", "not_found");
  const transfer = await tx.transfer.findUniqueOrThrow({
    where: { id: transferId },
    include: {
      lines: {
        include: {
          item: { select: { id: true, name: true, sku: true, tracking: true, qrCode: true, description: true, unitCostMinor: true, avgCostMinor: true, brand: true, model: true, unit: { select: { name: true, symbol: true } }, category: { select: { name: true } } } },
          assets: { include: { asset: { select: { id: true, qrCode: true, assetTag: true, status: true } } } },
        },
        orderBy: { id: "asc" },
      },
      sourceSpace: { select: { id: true, slug: true, name: true, internalTransferApproval: true, minEvidencePhotos: true } },
      destSpace: { select: { id: true, slug: true, name: true, minEvidencePhotos: true, acceptsTransfers: true } },
    },
  });
  if (!canTransfer(transfer.status, action)) {
    throw new DomainError(`${transferRef(transfer.number)} is ${TRANSFER_STATUS_LABEL[transfer.status].toLowerCase()}, so that step isn't available.`, "conflict");
  }
  return transfer;
}

export type LockedTransfer = Awaited<ReturnType<typeof lockTransfer>>;

export function isBetweenSpaces(transfer: { sourceSpaceId: string; destSpaceId: string }) {
  return transfer.sourceSpaceId !== transfer.destSpaceId;
}

/**
 * Match scans against what is on this transfer only (item labels and the
 * asset tags on its lines). The receiving space can scan the source's
 * labels without being able to look anything else up in the source space.
 */
export function matchTransferScans(transfer: LockedTransfer, scanned: string[]) {
  const codes = new Set<string>();
  for (const value of scanned) {
    if (!value.trim()) continue;
    const code = extractQrCode(value);
    if (!code) throw new DomainError("One of the scans isn't a Space Works QR code. Scan the label again.", "invalid");
    codes.add(code);
  }
  const items = new Set<string>();
  const assets = new Set<string>();
  for (const code of codes) {
    const line = transfer.lines.find((l) => l.item.qrCode === code);
    if (line) { items.add(line.itemId); continue; }
    const asset = transfer.lines.flatMap((l) => l.assets).find((a) => a.asset.qrCode === code);
    if (asset) { assets.add(asset.assetId); continue; }
    throw new DomainError(`Code ${code} isn't on this transfer.`, "invalid");
  }
  return { codes: [...codes], items, assets };
}

/** Per-transfer timeline (seen by both spaces) plus the space audit log and webhooks. */
export async function logTransferStep(tx: Tx, transfer: { id: string; number: number; sourceSpaceId: string; destSpaceId: string }, step: {
  type: string; event?: EventType; spaceId: string; actor: Actor; note?: string | null; metadata?: Record<string, string | number | boolean | null>; evidenceId?: string | null; status?: TransferStatus;
}) {
  await tx.transferEvent.create({
    data: { transferId: transfer.id, spaceId: step.spaceId, type: step.type, actorId: step.actor.userId, note: step.note?.slice(0, 1000) ?? null, metadata: (step.metadata ?? undefined) as Prisma.InputJsonValue | undefined, evidenceId: step.evidenceId ?? null },
  });
  await recordAuditEvent({ client: tx, action: `transfer.${step.type}`, spaceId: step.spaceId, actorId: step.actor.userId, actorApiTokenId: step.actor.apiTokenId ?? null, targetType: "Transfer", targetId: transfer.id, metadata: step.metadata });
  if (!step.event) return;
  const data = { transferId: transfer.id, reference: transferRef(transfer.number), status: step.status ?? null, betweenSpaces: isBetweenSpaces(transfer) };
  await emitEvent(tx, { spaceId: transfer.sourceSpaceId, type: step.event, data });
  if (isBetweenSpaces(transfer)) await emitEvent(tx, { spaceId: transfer.destSpaceId, type: step.event, data });
}

export function transferUrl(slug: string, transferId: string) {
  return `/s/${slug}/transfers/${transferId}`;
}
