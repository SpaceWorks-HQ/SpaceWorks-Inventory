// Generated from app/s/[spaceSlug]/kits/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { canManageCatalogue, requireSpace } from "@/lib/permissions";

export async function loadKitsPage({ params }: PageProps<"/s/[spaceSlug]/kits">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const [kitRows, containerRows, itemRows] = await Promise.all([
    prisma.kit.findMany({ where: { spaceId: space.id }, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }], select: { id: true, name: true, description: true, lendable: true, archivedAt: true, lines: { select: { itemId: true, quantity: true, item: { select: { name: true } } }, orderBy: { item: { name: "asc" } } } } }),
    prisma.container.findMany({ where: { spaceId: space.id }, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { code: "asc" }], take: 500, select: { id: true, code: true, name: true, archivedAt: true, loans: { where: { status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } }, select: { id: true, number: true }, take: 1 } } }),
    prisma.item.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, sku: true }, take: 2000 }),
  ]);
const kits = kitRows.map((kit) => ({ id: kit.id, name: kit.name, description: kit.description ?? "", lendable: kit.lendable, archived: kit.archivedAt !== null, lines: kit.lines.map((line) => ({ itemId: line.itemId, item: line.item.name, quantity: line.quantity })) }));
const containers = containerRows.map((box) => ({ id: box.id, code: box.code, name: box.name, archived: box.archivedAt !== null, loan: box.loans[0] ? { id: box.loans[0].id, ref: loanRef(box.loans[0].number) } : null }));
const items = itemRows.map((item) => ({ id: item.id, label: `${item.name} (${item.sku})` }));
const slug = space.slug;
const canEdit = canManageCatalogue(membership);
return viewDto({ kits, containers, items, slug, canEdit } as const);
}
