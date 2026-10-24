import { isIP } from "node:net";

/**
 * Webhook targets must be public internet addresses so a space manager cannot
 * point the server at its own private network (SSRF). Development and
 * trusted LANs can opt out with ALLOW_PRIVATE_WEBHOOK_TARGETS=true.
 */
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]!);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(lower);
  }
  return true;
}

export function privateTargetsAllowed(env: Record<string, string | undefined> = process.env) {
  return env.ALLOW_PRIVATE_WEBHOOK_TARGETS === "true";
}

/** Syntax check for the endpoint form: https only in production, no credentials in the URL. */
export function webhookUrlProblem(raw: string, env: Record<string, string | undefined> = process.env): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full URL starting with https://.";
  }
  if (url.username || url.password) return "Remove the username and password from the URL.";
  const httpAllowed = env.NODE_ENV !== "production" || privateTargetsAllowed(env);
  if (url.protocol !== "https:" && !(httpAllowed && url.protocol === "http:")) return "Use an https:// URL.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!privateTargetsAllowed(env) && (host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isPrivateAddress(host)))) {
    return "Webhooks can only reach public addresses.";
  }
  return null;
}
