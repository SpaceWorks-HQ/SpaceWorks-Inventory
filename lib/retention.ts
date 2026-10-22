import "server-only";

import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Remove expired operational records. Never deletes business, evidence or audit data. */
export async function purgeExpiredOperationalData(now = new Date()) {
  const retentionDays = Math.min(Math.max(Number(process.env.OUTBOX_RETENTION_DAYS || 30), 1), 365);
  const before = new Date(now.getTime() - retentionDays * DAY_MS);
  const [tokens, sessions, resets, verifications, magicLinks, sent, failed, deliveries] = await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } }),
    prisma.session.deleteMany({ where: { expires: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.magicLinkToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.outboxMessage.deleteMany({ where: { status: "SENT", sentAt: { lt: before } } }),
    prisma.outboxMessage.deleteMany({ where: { status: "FAILED", createdAt: { lt: before } } }),
    prisma.webhookDelivery.deleteMany({ where: { status: { not: "PENDING" }, createdAt: { lt: before } } }),
  ]);
  return {
    verificationTokens: tokens.count,
    sessions: sessions.count,
    passwordResetTokens: resets.count,
    emailVerificationTokens: verifications.count,
    magicLinkTokens: magicLinks.count,
    sentOutboxMessages: sent.count,
    failedOutboxMessages: failed.count,
    webhookDeliveries: deliveries.count,
  };
}
