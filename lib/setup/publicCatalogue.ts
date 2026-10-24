import "server-only";

import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError } from "@/lib/domainError";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { describeItemFees, isFreeLending } from "@/lib/payments/fees";
import { publicAvailability, publicCatalogueVisible, type PublicAvailability } from "./publicAccess";

export type PublicItem = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  category: string | null;
  imageUrl: string | null;
  availability: PublicAvailability;
  fees: string[];
};

/**
 * The public catalogue of a space: lendable, active items with a photo, an
 * availability word and fees in words. Null (→ 404) unless the space is live
 * and published its catalogue. Never exposes counts, SKUs, locations or members.
 */
export async function publicCatalogue(slug: string) {
  if (typeof slug !== "string" || slug.length === 0 || slug.length > 64) return null;
  const space = await prisma.space.findUnique({ where: { slug } });
  if (!space || !publicCatalogueVisible(space)) return null;
  const items = await prisma.item.findMany({
    where: { spaceId: space.id, lendable: true, archivedAt: null },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true, name: true, description: true, consumable: true, depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true,
      category: { select: { id: true, name: true, depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true } },
      images: { select: { id: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
  const availability = await availabilityFor(space.id, items.map((item) => item.id));
  const rows: PublicItem[] = items.map((item) => {
    const totals = availabilityOf(availability, item.id);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      categoryId: item.category?.id ?? null,
      category: item.category?.name ?? null,
      imageUrl: item.images[0] ? `/api/public/${encodeURIComponent(space.slug)}/images/${item.images[0].id}` : null,
      availability: publicAvailability(totals.available, totals.onLoan),
      fees: describeItemFees(space, item, item.category, space.currency),
    };
  });
  const categories = [...new Map(rows.filter((row) => row.categoryId).map((row) => [row.categoryId!, row.category!])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    space: {
      id: space.id,
      slug: space.slug,
      name: space.name,
      tagline: space.tagline,
      address: space.address,
      hasLogo: Boolean(space.logoKey),
      lendingEnabled: space.lendingEnabled,
      selfJoin: space.selfJoin,
      freeLending: isFreeLending(space),
    },
    items: rows,
    categories,
  };
}

/**
 * A signed-in account joins a space as MEMBER from its public catalogue.
 * Only when the space publishes its catalogue and allows self-join.
 */
export async function joinSpace(tx: Tx, slug: string, userId: string) {
  const space = await tx.space.findUnique({ where: { slug }, select: { id: true, slug: true, publicCatalogue: true, archivedAt: true, selfJoin: true } });
  if (!space || !publicCatalogueVisible(space) || !space.selfJoin) throw new DomainError("This space isn't open to new members. Ask the space team for an invitation.", "forbidden");
  const existing = await tx.membership.findUnique({ where: { userId_spaceId: { userId, spaceId: space.id } }, select: { id: true, status: true } });
  if (existing?.status === "SUSPENDED") throw new DomainError("Your membership here is suspended. Ask the space team.", "forbidden");
  if (existing) return { slug: space.slug, joined: false };
  const membership = await tx.membership.create({ data: { userId, spaceId: space.id, role: "MEMBER" }, select: { id: true } });
  await recordAuditEvent({ client: tx, action: "member.joined", spaceId: space.id, actorId: userId, targetType: "Membership", targetId: membership.id, metadata: { via: "public_catalogue" } });
  return { slug: space.slug, joined: true };
}
