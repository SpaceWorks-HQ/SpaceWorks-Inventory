import { randomUUID } from "node:crypto";
import type { SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSpaceWithDefaults } from "@/lib/spaces";
import { newQrCode } from "@/lib/catalogue/qr";

/** Unique suffix per test file so integration suites never collide. */
export function uniqueSuffix() {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

export async function createUser(email: string, name = "Test Member") {
  return prisma.user.create({ data: { email, name, emailVerified: new Date() } });
}

export async function createSpace(slug: string, managerId: string) {
  return prisma.$transaction((tx) => createSpaceWithDefaults(tx, { name: `Space ${slug}`, slug, managerId }));
}

/** A space with its creator (`owner`, the first inventory manager), a staff member, a member and two shelves. */
export async function seedSpace(suffix: string) {
  const domain = `@${suffix}.test`;
  const owner = await createUser(`owner${domain}`, "Owner");
  const staff = await createUser(`staff${domain}`, "Staff");
  const member = await createUser(`member${domain}`, "Member");
  const space = await createSpace(`space-${suffix}`, owner.id);
  await addMember(space.id, staff.id, "STAFF");
  const membership = await addMember(space.id, member.id, "MEMBER");
  const room = await prisma.location.create({ data: { spaceId: space.id, name: "Room", code: "R1", kind: "ROOM", qrCode: newQrCode("location") } });
  const shelfA = await prisma.location.create({ data: { spaceId: space.id, parentId: room.id, name: "Shelf A", code: "R1-A", kind: "SHELF", qrCode: newQrCode("location") } });
  const shelfB = await prisma.location.create({ data: { spaceId: space.id, parentId: room.id, name: "Shelf B", code: "R1-B", kind: "SHELF", qrCode: newQrCode("location") } });
  return { domain, owner, staff, member, membership, space, room, shelfA, shelfB };
}

export async function addMember(spaceId: string, userId: string, role: SpaceRole = "MEMBER") {
  return prisma.membership.create({ data: { spaceId, userId, role } });
}

export async function cleanup(spaceSlugs: string[], emailSuffix: string) {
  const spaces = await prisma.space.findMany({ where: { slug: { in: spaceSlugs } }, select: { id: true } });
  const ids = spaces.map(w => w.id);
  await prisma.$executeRaw`DELETE FROM "OutboxMessage" o WHERE o.payload->>'spaceId' = ANY(${ids}::text[]) OR (o.kind='webhook.deliver' AND EXISTS (SELECT 1 FROM "WebhookDelivery" d WHERE d.id=o.payload->>'deliveryId' AND d."spaceId" = ANY(${ids}::text[]))) OR o.payload->>'to' LIKE ${'%' + emailSuffix}`;
  // Loans keep their borrower (no cascade from User), so remove them with the space first.
  await prisma.loan.deleteMany({ where: { spaceId: { in: ids } } });
  await prisma.space.deleteMany({ where: { slug: { in: spaceSlugs } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: emailSuffix } } });
}
