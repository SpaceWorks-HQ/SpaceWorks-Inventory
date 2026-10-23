import { evidencePhotoForViewer } from "@/lib/desk/evidence";
import { findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { objectResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * An evidence photo, shown only to staff of the space (either side of a
 * transfer) and to the borrower of the loan it belongs to. Anything else is
 * the same 404 as an unknown id.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/s/[spaceSlug]/evidence/[photoId]">) {
  const { spaceSlug, photoId } = await params;
  const user = await getCurrentUser();
  if (!user) return notFound();
  const context = await findSpaceForUser(spaceSlug, user.id);
  if (!context) return notFound();
  const photo = await evidencePhotoForViewer({ spaceId: context.space.id, userId: user.id, role: context.membership.role, photoId });
  if (!photo) return notFound();
  return objectResponse({ storageKey: photo.storageKey, filename: `evidence-${photo.id}.webp`, contentType: photo.contentType }, { cache: "private" });
}
