import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";
import { findLinkRequest } from "@/lib/repairs";
import { objectResponse } from "@/lib/storage";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/** A photo of the one repair an external technician's open link points at. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/r/[token]/photos/[photoId]">) {
  const { token, photoId } = await params;
  if (!(await checkRateLimit(request, "repairLink"))) return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  const found = await findLinkRequest(token);
  if (!found) return notFound();
  const photo = await prisma.repairPhoto.findFirst({ where: { id: photoId, issueId: found.issue.id }, select: { id: true, storageKey: true, contentType: true } });
  if (!photo) return notFound();
  return objectResponse({ storageKey: photo.storageKey, filename: `repair-${photo.id}.webp`, contentType: photo.contentType }, { cache: "private" });
}
