import { prisma } from "@/lib/db";
import { findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { objectResponse } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * The space logo. Public (and cacheable) while the space's catalogue is
 * public; otherwise only active members see it. Unknown, archived and
 * private spaces all answer the same 404.
 */
export async function GET(_request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  if (typeof spaceSlug !== "string" || spaceSlug.length === 0 || spaceSlug.length > 64) return notFound();
  const space = await prisma.space.findUnique({ where: { slug: spaceSlug }, select: { logoKey: true, publicCatalogue: true, archivedAt: true } });
  if (!space || space.archivedAt || !space.logoKey) return notFound();
  if (!space.publicCatalogue) {
    const user = await getCurrentUser();
    if (!user || !(await findSpaceForUser(spaceSlug, user.id))) return notFound();
  }
  return objectResponse({ storageKey: space.logoKey, filename: "logo.webp", contentType: "image/webp" }, { cache: space.publicCatalogue ? "public" : "private" });
}
