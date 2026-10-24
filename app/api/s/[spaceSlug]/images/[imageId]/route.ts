import { imageForSpace } from "@/lib/catalogue/images";
import { findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { objectResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** An item photo for any active member of the space; everyone else gets the same 404 as an unknown photo. */
export async function GET(_request: Request, context: { params: Promise<{ spaceSlug: string; imageId: string }> }) {
  const { spaceSlug, imageId } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  const image = found ? await imageForSpace(found.space.id, imageId) : null;
  if (!image) return notFound();
  const response = await objectResponse({ storageKey: image.storageKey, filename: `${image.id}.webp`, contentType: image.contentType });
  if (response.ok) response.headers.set("Cache-Control", "private, max-age=300");
  return response;
}
