import "server-only";

import type { z } from "zod";
import type { AuthenticatedToken } from "@/lib/apiTokens";
import { apiError, apiJson, readJson, requireApiToken, requireScope } from "@/lib/apiTokens/http";
import type { ApiScope } from "@/lib/apiTokens/scopes";
import { ApiInputError, failureFor, type ApiFailure } from "./errors";

/**
 * One wrapper for every /api/v1 handler: API key auth and rate limit,
 * scope check, then the handler, with refusals mapped to
 * `{ error: { code, message } }`. The space always comes from the key.
 */
export type ApiContext = {
  token: AuthenticatedToken;
  spaceId: string;
  space: AuthenticatedToken["principal"]["space"];
  /** Actor for domain services: the key's creator, acting through the key. */
  actor: { userId: string; apiTokenId: string };
  url: URL;
  params: URLSearchParams;
};

export async function withApi(request: Request, kind: "read" | "write", scope: ApiScope, handler: (ctx: ApiContext) => Promise<Response>): Promise<Response> {
  const token = await requireApiToken(request, kind);
  if (token instanceof Response) return token;
  const refused = requireScope(token, scope);
  if (refused) return refused;
  const url = new URL(request.url);
  const { principal } = token;
  try {
    return await handler({
      token,
      spaceId: principal.space.id,
      space: principal.space,
      actor: { userId: principal.userId, apiTokenId: principal.tokenId },
      url,
      params: url.searchParams,
    });
  } catch (error) {
    const failure = failureFor(error);
    if (failure) return fail(failure);
    console.error("api.v1_failed", { path: url.pathname, error: error instanceof Error ? error.name : "unknown" });
    return apiError(500, "INTERNAL", "The request couldn't be completed. Try again.");
  }
}

export function fail(failure: ApiFailure): Response {
  return apiError(failure.status, failure.code, failure.message);
}

export function notFoundResponse(what: string): Response {
  return apiError(404, "NOT_FOUND", `That ${what} wasn't found.`);
}

export { apiJson };

/** Parse a JSON body with a schema; a missing or non-JSON body is a 400. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const body = await readJson(request);
  if (body === null || typeof body !== "object") throw new ApiInputError("Send a JSON object body with 'Content-Type: application/json'.");
  return schema.parse(body);
}

/** Like parseBody, but an empty body is fine (actions with optional fields). */
export async function parseOptionalBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await request.text().catch(() => "");
  if (!text.trim()) return schema.parse({});
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) throw new ApiInputError("Send the body as JSON with 'Content-Type: application/json'.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiInputError("The request body isn't valid JSON.");
  }
  return schema.parse(body ?? {});
}

/** Route params arrive as a promise in Next 16. Ids are checked before they reach a query. */
export function validId(value: string | undefined): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}
