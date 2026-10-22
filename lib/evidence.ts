import "server-only";

import type { EvidenceKind } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import type { StoredImage } from "@/lib/storage";

export type EvidenceInput = { photos: StoredImage[]; remarks: string; scannedCodes: string[] };

/**
 * Record the proof of a handover: photos already stored (decoded, stripped
 * and re-encoded by lib/storage), the remarks and the QR codes scanned.
 * Rows are append-only (database trigger).
 */
export async function recordEvidence(tx: Tx, input: EvidenceInput & { spaceId: string; kind: EvidenceKind; loanId?: string | null; transferId?: string | null; actorId: string | null; minPhotos: number; remarksRequired: boolean }) {
  const remarks = input.remarks.trim();
  if (input.photos.length < Math.max(1, input.minPhotos)) {
    throw new DomainError(input.minPhotos > 1 ? `Take at least ${input.minPhotos} photos.` : "Take a photo of the items first.", "invalid");
  }
  if (input.photos.length > 6) throw new DomainError("Attach at most 6 photos.", "invalid");
  if (input.remarksRequired && remarks.length === 0) throw new DomainError("Add a remark about the condition of the items.", "invalid");
  if (remarks.length > 1000) throw new DomainError("Keep remarks under 1,000 characters.", "invalid");
  const prefix = `spaces/${input.spaceId}/evidence/`;
  if (input.photos.some((photo) => !photo.storageKey.startsWith(prefix))) throw new DomainError("A photo belongs to another space.", "invalid");
  return tx.evidence.create({
    data: {
      spaceId: input.spaceId,
      kind: input.kind,
      loanId: input.loanId ?? null,
      transferId: input.transferId ?? null,
      remarks,
      scannedCodes: [...new Set(input.scannedCodes)].slice(0, 500),
      actorId: input.actorId,
      photos: { create: input.photos.map((photo) => ({ storageKey: photo.storageKey, contentType: photo.contentType, sizeBytes: photo.sizeBytes, sha256: photo.sha256 })) },
    },
    select: { id: true },
  });
}
