import "server-only";

import type { GatewayProvider } from "./config";
import { handleWebhook } from "./webhooks";

export const MAX_WEBHOOK_BYTES = 256 * 1024;

const PROVIDERS: Record<string, GatewayProvider> = { razorpay: "RAZORPAY", stripe: "STRIPE" };

/** Read a body up to `limit` bytes, giving up as soon as it grows past it (chunked bodies included). */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/** The whole webhook route: provider and code from the path, a hard size cap, the raw body for the signature. */
export async function webhookResponse(providerSlug: string, code: string, request: Request) {
  const provider = PROVIDERS[providerSlug];
  if (!provider) return text("Not found", 404);
  const body = await readCapped(request, MAX_WEBHOOK_BYTES);
  if (body === null) return text("Payload too large", 413);
  try {
    const outcome = await handleWebhook(provider, code, body, request.headers);
    return text(outcome.body, outcome.status);
  } catch {
    console.error(`[payments] ${provider.toLowerCase()} webhook could not be applied; the provider will retry`);
    return text("Try again later", 503);
  }
}
