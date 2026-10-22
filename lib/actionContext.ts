import "server-only";

import { z } from "zod";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { actionError, NOT_ALLOWED, RATE_LIMITED } from "@/lib/actionResult";
import { getSpaceForAction, type SpaceContext } from "@/lib/permissions";
import type { RoleHolder } from "@/lib/roles";
import type { Bucket } from "@/lib/rateLimit";

const slugSchema = z.string().min(1).max(64);

type Denied = { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * The start of every space Server Action: resolve the space from the slug
 * server-side, check the caller's capability, then the rate limit. Returns
 * the context, or a UI-safe error to return as-is.
 */
export async function spaceAction(slug: unknown, allowed: (membership: RoleHolder) => boolean, bucket: Bucket = "action"): Promise<{ ctx: SpaceContext; denied?: undefined } | { ctx?: undefined; denied: Denied }> {
  const parsed = slugSchema.safeParse(slug);
  const ctx = parsed.success ? await getSpaceForAction(parsed.data, "MEMBER") : null;
  if (!ctx || !allowed(ctx.membership)) return { denied: actionError(NOT_ALLOWED) };
  if (await isActionRateLimited(bucket, ctx.user.id)) return { denied: actionError(RATE_LIMITED) };
  return { ctx };
}

/** Map a domain StockError/WorkflowError (anything with a UI-safe message) to an action error; rethrow the rest. */
export function domainFailure(error: unknown): Denied {
  if (error instanceof Error && "code" in error && typeof (error as { code: unknown }).code === "string") return actionError(error.message);
  throw error;
}
