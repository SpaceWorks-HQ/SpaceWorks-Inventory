import "server-only";

import { prisma } from "@/lib/db";
import { extractQrCode, qrKindOf } from "@/lib/catalogue/qr";
import { qrLandingDecision, type QrDecision, type QrTarget } from "./publicAccess";

const spaceSelect = { id: true, slug: true, publicCatalogue: true, archivedAt: true, lendingEnabled: true } as const;
type SpaceRow = { id: string; slug: string; publicCatalogue: boolean; archivedAt: Date | null; lendingEnabled: boolean };

/** Find what a code labels anywhere in the install (codes are globally unique). */
export async function findQrTarget(raw: string): Promise<(QrTarget & { spaceId: string }) | null> {
  const code = extractQrCode(raw);
  if (!code) return null;
  const make = (kind: QrTarget["kind"], id: string, itemId: string | null, space: SpaceRow, lendable: boolean) => ({ kind, id, itemId, space, spaceId: space.id, lendable });
  switch (qrKindOf(code)) {
    case "item": {
      const row = await prisma.item.findUnique({ where: { qrCode: code }, select: { id: true, lendable: true, archivedAt: true, space: { select: spaceSelect } } });
      return row ? make("item", row.id, row.id, row.space, row.lendable && !row.archivedAt) : null;
    }
    case "asset": {
      const row = await prisma.asset.findUnique({ where: { qrCode: code }, select: { id: true, itemId: true, status: true, item: { select: { lendable: true, archivedAt: true } }, space: { select: spaceSelect } } });
      return row ? make("asset", row.id, row.itemId, row.space, row.item.lendable && !row.item.archivedAt && row.status !== "RETIRED") : null;
    }
    case "location": {
      const row = await prisma.location.findUnique({ where: { qrCode: code }, select: { id: true, space: { select: spaceSelect } } });
      return row ? make("location", row.id, null, row.space, false) : null;
    }
    case "kit": {
      const row = await prisma.kit.findUnique({ where: { qrCode: code }, select: { id: true, space: { select: spaceSelect } } });
      return row ? make("kit", row.id, null, row.space, false) : null;
    }
    case "container": {
      const row = await prisma.container.findUnique({ where: { qrCode: code }, select: { id: true, space: { select: spaceSelect } } });
      return row ? make("container", row.id, null, row.space, false) : null;
    }
    default:
      return null;
  }
}

/** The viewer's active role in the owning space and their own open loan holding this item or asset. */
async function viewerFor(target: QrTarget & { spaceId: string }, userId: string | null) {
  if (!userId) return { signedIn: false, role: null, ownLoanId: null };
  const membership = await prisma.membership.findUnique({ where: { userId_spaceId: { userId, spaceId: target.spaceId } }, select: { role: true, status: true } });
  const role = membership?.status === "ACTIVE" ? membership.role : null;
  let ownLoanId: string | null = null;
  if (role && target.itemId) {
    const loan = await prisma.loan.findFirst({
      where: {
        spaceId: target.spaceId,
        borrowerId: userId,
        status: { in: ["APPROVED", "ISSUED", "PARTIALLY_RETURNED"] },
        lines: { some: target.kind === "asset" ? { assetId: target.id } : { itemId: target.itemId } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    ownLoanId = loan?.id ?? null;
  }
  return { signedIn: true, role, ownLoanId };
}

/** Resolve a scanned code for this viewer (null user = signed out). */
export async function resolveQrLanding(code: string, userId: string | null): Promise<QrDecision> {
  const target = await findQrTarget(code);
  if (!target) return { type: "neutral", signedIn: Boolean(userId) };
  return qrLandingDecision(target, await viewerFor(target, userId));
}
