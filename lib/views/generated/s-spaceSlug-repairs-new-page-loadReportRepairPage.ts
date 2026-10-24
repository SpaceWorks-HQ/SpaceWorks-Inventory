// Generated from app/s/[spaceSlug]/repairs/new/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { locationTree } from "@/lib/catalogue/locations";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { canViewStock } from "@/lib/roles";

export async function loadReportRepairPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/repairs/new">) {
const { spaceSlug } = await params;
const query = await searchParams;
const { space, membership } = await requireSpace(spaceSlug, "MEMBER");
const staff = canViewStock(membership);
const [items, assets, locations] = await Promise.all([
    prisma.item.findMany({ where: { spaceId: space.id, archivedAt: null }, orderBy: { name: "asc" }, take: 2000, select: { id: true, name: true, sku: true, tracking: true } }),
    staff ? prisma.asset.findMany({ where: { spaceId: space.id, status: { notIn: ["RETIRED", "LOST"] } }, orderBy: { assetTag: "asc" }, take: 5000, select: { id: true, itemId: true, assetTag: true, status: true } }) : Promise.resolve([]),
    staff ? locationTree(space.id) : Promise.resolve([]),
  ]);
const presetItem = typeof query.item === "string" ? query.item : null;
const presetAsset = typeof query.asset === "string" ? query.asset : null;
const locationOptions = locations.map((location) => ({ id: location.id, label: `${location.code} · ${location.path}` }));
return viewDto({ space, staff, items, assets, locations, presetItem, presetAsset, locationOptions } as const);
}
