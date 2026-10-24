// Generated from app/s/[spaceSlug]/locations/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { locationTree } from "@/lib/catalogue/locations";
import { param } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { canManageLocations, requireSpace } from "@/lib/permissions";

export async function loadLocationsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/locations">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const showArchived = param(query, "archived") === "1";
const tree = await locationTree(space.id, prisma, { includeArchived: showArchived });
const details = await prisma.location.findMany({ where: { spaceId: space.id }, select: { id: true, description: true } });
const counts = await prisma.stockLevel.groupBy({ by: ["locationId"], where: { spaceId: space.id, onHand: { gt: 0 } }, _count: { _all: true }, _sum: { onHand: true } });
const descriptionById = new Map(details.map((row) => [row.id, row.description ?? ""]));
const countById = new Map(counts.map((row) => [row.locationId, { itemLines: row._count._all, units: row._sum.onHand ?? 0 }]));
const rows = tree.map((row) => ({
    id: row.id, name: row.name, code: row.code, kind: row.kind, parentId: row.parentId ?? "", description: descriptionById.get(row.id) ?? "",
    depth: row.depth, archived: row.archivedAt !== null, itemLines: countById.get(row.id)?.itemLines ?? 0, units: countById.get(row.id)?.units ?? 0,
  }));
const parents = tree.filter((row) => row.archivedAt === null).map((row) => ({ id: row.id, label: `${row.path} (${row.code})` }));
const slug = space.slug;
const canEdit = canManageLocations(membership);
return viewDto({ showArchived, rows, parents, slug, canEdit } as const);
}
