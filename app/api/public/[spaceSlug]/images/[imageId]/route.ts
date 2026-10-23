import type { NextRequest } from "next/server";
import { publicImage } from "@/lib/catalogue/images";
import { checkRateLimit } from "@/lib/rateLimit";
import { objectResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A photo for the public catalogue: served without sign-in only while the
 * space's catalogue is public and the item is lendable and not archived.
 * Anything else answers the same 404.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ spaceSlug: string; imageId: string }> }) {
  if (!(await checkRateLimit(request, "publicCatalogue"))) {
    return new Response("Too many requests. Try again later.", { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  }
  const { spaceSlug, imageId } = await context.params;
  const image = await publicImage(spaceSlug, imageId);
  if (!image) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return objectResponse({ storageKey: image.storageKey, filename: `${image.id}.webp`, contentType: image.contentType }, { cache: "public" });
}
