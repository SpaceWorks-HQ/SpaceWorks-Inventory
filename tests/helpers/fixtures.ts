import { randomUUID } from "node:crypto";
import type { SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSpaceWithDefaults } from "@/lib/spaces";

/** Unique suffix per test file so integration suites never collide. */
export function uniqueSuffix() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function createUser(email: string, name = "Test Member") {
  return prisma.user.create({ data: { email, name, emailVerified: new Date() } });
}

export async function createSpace(slug: string, ownerId: string) {
  return prisma.$transaction((tx) => createSpaceWithDefaults(tx, { name: `Space ${slug}`, slug, ownerId }));
}

export async function addMember(spaceId: string, userId: string, role: SpaceRole = "MEMBER") {
  return prisma.membership.create({ data: { spaceId, userId, role } });
}

export async function cleanup(spaceSlugs: string[], emailSuffix: string) {
  const spaces = await prisma.space.findMany({ where: { slug: { in: spaceSlugs } }, select: { id: true } });
  const ids = spaces.map(w => w.id);
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" o WHERE o.payload->>'spaceId' IN (SELECT id FROM "Space" WHERE slug = ANY(${spaceSlugs}::text[])) OR (o.kind='notify.deliver' AND EXISTS (SELECT 1 FROM "NotificationDelivery" d WHERE d.id=o.payload->>'deliveryId' AND d."spaceId" = ANY(${ids}::text[]))) OR o.payload->>'to' LIKE ${'%' + emailSuffix}`;
  await prisma.space.deleteMany({ where: { slug: { in: spaceSlugs } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: emailSuffix } } });
}
