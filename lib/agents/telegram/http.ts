import "server-only";
import { getCurrentUser, findSpaceForUser } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { sha256Hex } from "@/lib/crypto";
import { inventoryTelegramLinks, lookupInventoryTelegramActor } from "./links";
import { inventoryTelegramConfig } from "./config";

const headers = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const response = (data: unknown, status = 200) => Response.json(data, { status, headers });
/** Next may represent a bodyless browser fetch as an already-closed stream. */
async function emptyBody(request: Request): Promise<boolean> {
  if (!request.body) return true;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); });
  try {
    for (let count = 0; count < 8; count++) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (!chunk) return false;
      if (chunk.done) return true;
      if (chunk.value.byteLength) return false;
    }
    return false;
  } catch { return false; }
  finally {
    clearTimeout(timer);
    // Cancellation must not wait on an untrusted producer's cancellation hook.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
/** POST issues privately; DELETE revokes only this session user's links in this space. */
export async function inventoryTelegramHttp(request: Request, slug: string) {
  const user = await getCurrentUser();
  if (!user) return response({ error: "Sign in to Inventory first." }, 401);
  const context = await findSpaceForUser(slug, user.id);
  if (!context || context.membership.role === "TECHNICIAN") return response({ error: "That space was not found." }, 404);
  if (!["POST", "DELETE"].includes(request.method)) return response({ error: "Use the account link controls." }, 405);
  let config;
  try { config = await inventoryTelegramConfig(); } catch { return response({ error: "The operator must configure private Telegram storage and the Inventory origin." }, 503); }
  if (request.headers.get("origin") !== config.hostUrl || request.headers.get("sec-fetch-site") === "cross-site") return response({ error: "Use the signed-in Inventory app." }, 403);
  if (!await checkRateLimitById("apiWrite", `telegram-link:${sha256Hex(user.id)}`)) return response({ error: "Too many requests. Wait before trying again." }, 429);
  // No identity, tenant or action can be submitted in a body.
  if (!await emptyBody(request)) return response({ error: "Account linking does not accept a request body." }, 400);
  const actor = await lookupInventoryTelegramActor(user.id, context.space.id);
  if (!actor) return response({ error: "That space was not found." }, 404);
  try {
    const links = await inventoryTelegramLinks();
    if (request.method === "DELETE") { await links.revoke(actor); return response({ revoked: true }); }
    return response(await links.issue(actor));
  } catch { return response({ error: "Account linking is unavailable. Ask the operator to check private storage." }, 503); }
}
