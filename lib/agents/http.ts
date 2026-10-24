import "server-only";
import { createOpsHelper, type Actor } from "@spaceworks-hq/agents/helper";
import { getCurrentUser, findSpaceForUser } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { sha256Hex } from "@/lib/crypto";
import { inventoryAgentActivation } from "./activation";
import { createInventoryOpsAdapter } from "./adapter";

const privateHeaders = { "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
function refuse(status: number, code: string, message: string) { return Response.json({ error: { code, message } }, { status, headers: privateHeaders }); }

/** Only the authenticated route context supplies identity and tenant authority. */
export async function inventoryOpsHttp(request: Request, slug: string, path: string[]) {
  const user = await getCurrentUser();
  if (!user) return refuse(401, "UNAUTHENTICATED", "Sign in to Inventory first.");
  const context = await findSpaceForUser(slug, user.id);
  if (!context || context.membership.role === "TECHNICIAN") return refuse(404, "NOT_FOUND", "That space was not found.");
  const canonicalOrigin = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? request.url).origin;
  if (request.method !== "GET" && request.headers.get("origin") !== canonicalOrigin) return refuse(403, "INVALID_ORIGIN", "Use the signed-in Inventory app to submit this request.");
  if (!path.length || path.some(value => value === "." || value === ".." || !/^[A-Za-z0-9._-]+$/.test(value))) return refuse(404, "NOT_FOUND", "That operation endpoint was not found.");
  if (!(await checkRateLimitById(request.method === "GET" ? "apiRead" : "apiWrite", `agents:${sha256Hex(user.id)}`))) return refuse(429, "RATE_LIMITED", "Too many requests. Wait before trying again.");
  const actor: Actor = { id: user.id, tenantId: context.space.id, role: context.membership.role.toLowerCase() as Actor["role"], name: user.name ?? "Inventory member" };
  const helper = createOpsHelper({ authenticate: async () => actor, adapter: createInventoryOpsAdapter(), activation: inventoryAgentActivation });
  const url = new URL(`/api/ops/v1/${path.join("/")}`, canonicalOrigin);
  return helper.handle(new Request(url, request));
}
