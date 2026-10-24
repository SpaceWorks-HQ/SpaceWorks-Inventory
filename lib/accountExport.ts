import "server-only";

import { prisma } from "@/lib/db";

/**
 * The signed-in member's own data, allow-listed field by field. Never
 * includes password hashes, MFA seeds, recovery codes, tokens, evidence
 * photos or other members' private data.
 */
export async function buildAccountExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, phone: true, emailVerified: true, mfaEnabledAt: true, createdAt: true, lastSeenAt: true,
      memberships: { select: { role: true, status: true, borrowingStatus: true, memberNumber: true, joinedAt: true, space: { select: { slug: true, name: true } } } },
    },
  });
  if (!user) return null;
  const [loans, payments, notifications] = await Promise.all([
    prisma.loan.findMany({
      where: { borrowerId: userId },
      select: {
        number: true, status: true, purpose: true, dueAt: true, issuedAt: true, returnedAt: true, createdAt: true,
        space: { select: { slug: true } },
        lines: { select: { quantityRequested: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, item: { select: { name: true, sku: true } } } },
        charges: { select: { kind: true, amountMinor: true, currency: true, status: true, refundedMinor: true, waivedReason: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.payment.findMany({
      where: { payerId: userId },
      select: { provider: true, status: true, method: true, amountMinor: true, currency: true, paidAt: true, payLater: true, createdAt: true, refunds: { select: { amountMinor: true, status: true, processedAt: true } } },
      take: 5000,
    }),
    prisma.notification.findMany({ where: { userId }, select: { kind: true, title: true, createdAt: true, readAt: true }, take: 2000 }),
  ]);
  const { memberships, ...profile } = user;
  return {
    exportedAt: new Date().toISOString(),
    format: "space-works-inventory-account-export/v1",
    profile,
    memberships,
    loans,
    payments,
    notifications,
  };
}
