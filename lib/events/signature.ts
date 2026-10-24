import crypto from "crypto";

/**
 * Webhook signatures: `X-SpaceWorks-Signature: t=<unix seconds>,v1=<hex>`
 * where v1 = HMAC-SHA256(secret, "<t>.<raw body>"). Receivers recompute it
 * and reject timestamps older than five minutes.
 */
export function signWebhook(secret: string, body: string, timestamp: number): string {
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyWebhookSignature(secret: string, body: string, header: string, now = Date.now(), toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((part) => part.trim().split("=", 2) as [string, string]));
  const timestamp = Number(parts.t);
  if (!Number.isSafeInteger(timestamp) || !parts.v1 || Math.abs(now / 1000 - timestamp) > toleranceSeconds) return false;
  const expected = signWebhook(secret, body, timestamp).split("v1=")[1]!;
  return expected.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

/** A new signing secret, shown once when the endpoint is created. */
export function newWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64url")}`;
}
