import { prisma } from "@/lib/db";
import { findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { repairViewer, visibleRepairs } from "@/lib/repairs";
import { objectResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** A repair photo, for whoever may see the repair (staff, its technicians, its reporter); anything else is a 404. */
export async function GET(_request: Request, { params }: RouteContext<"/api/s/[spaceSlug]/repairs/photos/[photoId]">) {
  const { spaceSlug, photoId } = await params;
  const user = await getCurrentUser();
  if (!user) return notFound();
  const context = await findSpaceForUser(spaceSlug, user.id);
  if (!context) return notFound();
  const viewer = await repairViewer(context.space.id, user, context.membership);
  const photo = await prisma.repairPhoto.findFirst({ where: { id: photoId, spaceId: context.space.id, issue: visibleRepairs(context.space.id, viewer) }, select: { id: true, storageKey: true, contentType: true } });
  if (!photo) return notFound();
  return objectResponse({ storageKey: photo.storageKey, filename: `repair-${photo.id}.webp`, contentType: photo.contentType }, { cache: "private" });
}
