import "server-only";

import type { SpaceRole } from "@prisma/client";
import { prisma, type DbClient } from "@/lib/db";

export type CreateSpaceInput = {
  name: string;
  slug: string;
  ownerId: string;
  tagline?: string | null;
  timezone?: string;
  currency?: string;
  tagPrefix?: string;
};

/** Units every new space starts with; the setup wizard can add more. */
export const DEFAULT_UNITS: readonly { name: string; symbol: string }[] = [
  { name: "Piece", symbol: "pcs" },
  { name: "Pack", symbol: "pack" },
  { name: "Metre", symbol: "m" },
  { name: "Gram", symbol: "g" },
];

/** Suggested categories offered (not created) by the setup wizard. */
export const SUGGESTED_CATEGORIES: readonly string[] = [
  "Hand tools",
  "Power tools",
  "Electronics",
  "Components",
  "3D printing",
  "Measuring",
  "Safety gear",
  "Consumables",
];

/** Derive a short asset-tag prefix from a space name ("TinkerSpace Kochi" → "TSK"). */
export function tagPrefixFor(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const initials = words.length > 1 ? words.map((word) => word[0]).join("") : (words[0] ?? "SW").slice(0, 3);
  return initials.slice(0, 5) || "SW";
}

/**
 * Create a space with its owner membership and default units. Run inside a
 * transaction so a failed setup leaves nothing behind.
 */
export async function createSpaceWithDefaults(tx: DbClient, input: CreateSpaceInput) {
  const space = await tx.space.create({
    data: {
      name: input.name,
      slug: input.slug,
      tagline: input.tagline ?? null,
      tagPrefix: input.tagPrefix ?? tagPrefixFor(input.name),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      ...(input.currency ? { currency: input.currency } : {}),
      memberships: { create: { userId: input.ownerId, role: "OWNER" } },
    },
  });
  await tx.unit.createMany({ data: DEFAULT_UNITS.map((unit) => ({ spaceId: space.id, ...unit })) });
  return space;
}

export type UserSpace = { id: string; slug: string; name: string; role: SpaceRole };

/** Active, non-archived spaces a user belongs to, alphabetically. */
export async function listUserSpaces(userId: string): Promise<UserSpace[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId, status: "ACTIVE", space: { archivedAt: null } },
    select: { role: true, space: { select: { id: true, slug: true, name: true } } },
    orderBy: { space: { name: "asc" } },
    take: 100,
  });
  return memberships.map((m) => ({ ...m.space, role: m.role }));
}
