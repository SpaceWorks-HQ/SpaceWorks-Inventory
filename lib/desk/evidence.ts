import "server-only";

import type { EvidenceKind, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hasRoleAtLeast } from "@/lib/roles";
import { personName } from "./format";

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  ISSUE: "Handed over",
  RETURN: "Returned",
  TRANSFER_DISPATCH: "Dispatched",
  TRANSFER_RECEIPT: "Received",
  INCIDENT: "Incident",
};

export type EvidenceView = {
  id: string;
  kindLabel: string;
  remarks: string;
  scannedCount: number;
  actorName: string;
  createdAt: Date;
  photos: { id: string; url: string }[];
};

export function evidencePhotoUrl(slug: string, photoId: string) {
  return `/api/s/${encodeURIComponent(slug)}/evidence/${photoId}`;
}

/**
 * Evidence of one loan (always of this space) or one transfer (both sides
 * see it), newest first, with photo URLs served through the evidence route
 * of the space the viewer is in.
 */
export async function evidenceFor(slug: string, where: { spaceId: string; loanId: string } | { transferId: string }): Promise<EvidenceView[]> {
  const rows = await prisma.evidence.findMany({
    where: "loanId" in where ? { spaceId: where.spaceId, loanId: where.loanId } : { transferId: where.transferId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, kind: true, remarks: true, scannedCodes: true, actorId: true, createdAt: true, photos: { select: { id: true }, orderBy: { createdAt: "asc" } } },
  });
  const actors = await namesOf(rows.map((row) => row.actorId));
  return rows.map((row) => ({
    id: row.id,
    kindLabel: EVIDENCE_KIND_LABEL[row.kind],
    remarks: row.remarks,
    scannedCount: row.scannedCodes.length,
    actorName: row.actorId ? actors.get(row.actorId) ?? "Someone" : "Space Works",
    createdAt: row.createdAt,
    photos: row.photos.map((photo) => ({ id: photo.id, url: evidencePhotoUrl(slug, photo.id) })),
  }));
}

/** Display names for actor ids (missing or deleted people read "Someone"). */
export async function namesOf(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((user) => [user.id, personName(user)]));
}

/**
 * Who may see an evidence photo, viewed from one space: staff (STAFF+) of
 * that space for its loans, staff of either side for a transfer's photos,
 * and the borrower of the loan the photos belong to. Everything else is
 * null, exactly like an unknown id.
 */
export async function evidencePhotoForViewer(input: { spaceId: string; userId: string; role: SpaceRole; photoId: string }) {
  if (!/^[a-z0-9]{8,40}$/i.test(input.photoId)) return null;
  const photo = await prisma.evidencePhoto.findUnique({
    where: { id: input.photoId },
    select: { id: true, storageKey: true, contentType: true, createdAt: true, evidence: { select: { spaceId: true, transferId: true, loan: { select: { spaceId: true, borrowerId: true } } } } },
  });
  if (!photo) return null;
  const staff = hasRoleAtLeast(input.role, "STAFF");
  const { evidence } = photo;
  if (evidence.transferId) {
    if (!staff) return null;
    const transfer = await prisma.transfer.findUnique({ where: { id: evidence.transferId }, select: { sourceSpaceId: true, destSpaceId: true } });
    if (!transfer || (transfer.sourceSpaceId !== input.spaceId && transfer.destSpaceId !== input.spaceId)) return null;
  } else {
    if (evidence.spaceId !== input.spaceId) return null;
    const borrower = evidence.loan?.spaceId === input.spaceId && evidence.loan.borrowerId === input.userId;
    if (!staff && !borrower) return null;
  }
  return { id: photo.id, storageKey: photo.storageKey, contentType: photo.contentType, createdAt: photo.createdAt };
}
