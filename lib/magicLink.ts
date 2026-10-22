import "server-only";

import { prisma } from "@/lib/db";
import { randomToken, sha256Hex } from "@/lib/crypto";

/** Sign-in links are short-lived and single use. */
export const MAGIC_LINK_TTL_MS = 15 * 60_000;

/** Create a link for an existing, enabled account. Returns the raw token (only ever emailed). */
export async function createMagicLink(userId: string, now = new Date()): Promise<string> {
  const token = randomToken(32);
  await prisma.$transaction([
    // One live link per account: a new request retires the previous one.
    prisma.magicLinkToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
    prisma.magicLinkToken.create({ data: { userId, tokenHash: sha256Hex(token), expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS) } }),
  ]);
  return token;
}

/** Look up an unexpired, unused link without spending it. */
export async function findUsableMagicLink(token: string, now = new Date()) {
  const link = await prisma.magicLinkToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { id: true, name: true, email: true, image: true, emailVerified: true, sessionVersion: true, disabledAt: true, mfaEnabledAt: true, mfaSecretEncrypted: true } },
    },
  });
  if (!link || link.usedAt || link.expiresAt <= now) return null;
  return link;
}

/** Atomically spend a link; concurrent sign-ins with the same link cannot both succeed. */
export async function consumeMagicLink(id: string, now = new Date()): Promise<boolean> {
  const result = await prisma.magicLinkToken.updateMany({ where: { id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
  return result.count === 1;
}
