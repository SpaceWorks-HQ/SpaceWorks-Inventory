import "./localEnv";
import { PrismaClient } from "@prisma/client";

/** The seeded demo database, for label codes and settings a journey must set up. */
export const prisma = new PrismaClient();

/** Switch a demo space's self-checkout on or off (journeys restore what they change). */
export async function setSelfCheckout(spaceSlug: string, enabled: boolean) {
  await prisma.space.update({ where: { slug: spaceSlug }, data: { selfCheckoutEnabled: enabled } });
}

/**
 * The sign-in link of a magic-link email still waiting in the outbox. Servers
 * without a running worker (the hosting harness) keep it there until sent.
 */
export async function pendingSignInLink(email: string, since: Date) {
  const rows = await prisma.outboxMessage.findMany({ where: { kind: "magic-link", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { payload: true }, take: 20 });
  for (const row of rows) {
    const payload = row.payload as { to?: unknown; signInUrl?: unknown };
    if (payload.to === email && typeof payload.signInUrl === "string") return payload.signInUrl;
  }
  return null;
}

/** An external technician's repair link from a request email still waiting in the outbox. */
export async function pendingRepairLink(email: string, since: Date) {
  const rows = await prisma.outboxMessage.findMany({ where: { kind: "repair-request", createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: { payload: true }, take: 20 });
  for (const row of rows) {
    const payload = row.payload as { to?: unknown; linkUrl?: unknown };
    if (payload.to === email && typeof payload.linkUrl === "string") return payload.linkUrl;
  }
  return null;
}
