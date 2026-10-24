import "server-only";

import type { Tx } from "@/lib/db";
import { DomainError, notFound } from "@/lib/domainError";
import { approveTransfer, cancelTransfer, rejectTransfer, requestTransfer } from "@/lib/transfers/workflow";
import type { TransferApiAction } from "./schemas";

/**
 * Transfers through the API, always acting as the key's space. A key can
 * move stock between its own locations or push stock to another space; it
 * cannot pull stock out of another space. Dispatch and receipt need QR
 * scans and photos, so they stay in the app.
 */
type Actor = { userId: string; apiTokenId: string };

export async function apiRequestTransfer(
  tx: Tx,
  spaceId: string,
  input: { destinationSpace: string | null; sourceLocationId: string; destinationLocationId: string | null; lines: { itemId: string; quantity: number }[]; reason: string | null; neededBy: Date | null },
  actor: Actor,
) {
  let destSpaceId = spaceId;
  if (input.destinationSpace) {
    const dest = await tx.space.findFirst({ where: { slug: input.destinationSpace, archivedAt: null }, select: { id: true } });
    if (!dest) notFound("space");
    destSpaceId = dest.id;
  }
  if (destSpaceId === spaceId && !input.destinationLocationId) throw new DomainError("Choose where the stock goes (destinationLocationId).", "invalid");
  return requestTransfer(tx, {
    sourceSpaceId: spaceId,
    destSpaceId,
    sourceLocationId: input.sourceLocationId,
    destLocationId: input.destinationLocationId,
    initiatedBySpaceId: spaceId,
    lines: input.lines,
    reason: input.reason,
    neededBy: input.neededBy,
  }, actor);
}

/** Only transfers this space takes part in exist for the key; others answer not found. */
export async function apiTransferAction(tx: Tx, spaceId: string, transferId: string, action: TransferApiAction, body: { quantities?: Record<string, number> | null; reason?: string | null }, actor: Actor) {
  const visible = await tx.transfer.findFirst({ where: { id: transferId, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] }, select: { id: true } });
  if (!visible) notFound("transfer");
  if (action === "approve") return approveTransfer(tx, { transferId, actingSpaceId: spaceId, quantities: body.quantities ?? null }, actor);
  if (action === "reject") return rejectTransfer(tx, { transferId, actingSpaceId: spaceId, reason: body.reason ?? "" }, actor);
  return cancelTransfer(tx, { transferId, actingSpaceId: spaceId, reason: body.reason ?? null }, actor);
}
