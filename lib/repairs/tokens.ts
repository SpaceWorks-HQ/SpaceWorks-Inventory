import { randomToken, sha256Hex } from "@/lib/crypto";

/**
 * An external technician's link to one repair request: 32 random bytes,
 * only the SHA-256 is stored. It works while the request is open (or while
 * they hold the repair) and never reveals anything else in the space.
 */
export function createRepairLinkToken() {
  const token = randomToken(32);
  return { token, tokenHash: hashRepairLinkToken(token) };
}

export function hashRepairLinkToken(token: string) {
  return sha256Hex(`repair-link:${token}`);
}

/** Shape check before any database lookup (43 base64url characters for 32 bytes). */
export function isPlausibleRepairLinkToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function repairLinkUrl(token: string, baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "") {
  return `${baseUrl.replace(/\/$/, "")}/r/${token}`;
}

export function requestExpiry(days: number, now = new Date()) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}
