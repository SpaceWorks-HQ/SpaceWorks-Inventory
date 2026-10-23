// Generated from app/admin/spaces/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { prisma } from "@/lib/db";
import { viewerTimeZone } from "@/lib/format/datetime";
import { requireSuperAdminMfa } from "@/lib/permissions";

export async function loadAdminSpacesPage() {
await requireSuperAdminMfa();
const spaces = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, name: true, slug: true, createdAt: true, archivedAt: true, setupCompletedAt: true, publicCatalogue: true, _count: { select: { memberships: true } } },
  });
const tz = viewerTimeZone();
return viewDto({ spaces, tz } as const);
}
