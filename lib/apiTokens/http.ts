import "server-only";

import { checkRateLimitById } from "@/lib/rateLimit";
import { authenticateApiToken, type AuthenticatedToken } from "@/lib/apiTokens";
import { hasScope, type ApiScope } from "@/lib/apiTokens/scopes";

/**
 * Shared plumbing for /api/v1 route handlers: bearer-token auth, per-token
 * rate limits, and error envelopes `{ error: { code, message } }`.
 */

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

export function apiError(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...HEADERS, ...extra } });
}

export function apiJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

export const unauthorized = () => apiError(401, "UNAUTHORIZED", "Send a valid API key as 'Authorization: Bearer swi_…'.", { "WWW-Authenticate": 'Bearer realm="space-works"' });

/** Authenticate and rate-limit; returns the token or a ready error response. */
export async function requireApiToken(request: Request, kind: "read" | "write"): Promise<AuthenticatedToken | Response> {
  const token = await authenticateApiToken(request.headers.get("authorization"));
  if (!token) return unauthorized();
  if (!(await checkRateLimitById(kind === "write" ? "apiWrite" : "apiRead", `token:${token.principal.tokenId}`))) {
    return apiError(429, "RATE_LIMITED", "Too many requests. Try again later.", { "Retry-After": "60" });
  }
  return token;
}

/** Answer 403 unless the key carries `scope`. */
export function requireScope(token: AuthenticatedToken, scope: ApiScope): Response | null {
  return hasScope(token.scopes, scope) ? null : apiError(403, "FORBIDDEN", `This API key needs the ${scope} scope.`);
}

/** Map a domain failure `{ ok: false, error, code? }` to an API error. */
export function domainError(result: { error: string; code?: string }) {
  const status = result.code === "not_found" ? 404 : result.code === "conflict" ? 409 : result.code === "forbidden" ? 403 : 400;
  return apiError(status, (result.code ?? "invalid").toUpperCase(), result.error);
}

/** Read `?limit=&cursor=` (and other string params) into a plain object. */
export function queryParams(request: Request, numeric: readonly string[] = ["limit"]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (!value) continue;
    out[key] = numeric.includes(key) && /^\d+$/.test(value) ? Number(value) : value;
  }
  return out;
}

export async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return null;
  return request.json().catch(() => null);
}
