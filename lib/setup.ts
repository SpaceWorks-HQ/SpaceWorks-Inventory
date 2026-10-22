import "server-only";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createSpaceWithDefaults } from "@/lib/spaces";

/** First-run setup is open only while the instance has no users at all. */
export async function isSetupOpen() {
  return (await prisma.user.count()) === 0;
}

export type SetupInput = {
  name: string;
  email: string;
  password: string;
  spaceName: string;
  spaceSlug: string;
  timezone?: string;
  currency?: string;
};

/**
 * Create the instance owner and the first space. A transaction-scoped
 * advisory lock plus a re-check inside it makes setup succeed exactly once,
 * even with concurrent submissions.
 */
export async function performSetup(input: SetupInput): Promise<{ ok: true; userId: string; spaceSlug: string } | { ok: false; error: string }> {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('swi:first-run-setup'))`;
    if ((await tx.user.count()) > 0) return { ok: false as const, error: "Setup is already complete. Sign in instead." };
    const user = await tx.user.create({
      data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash, emailVerified: new Date(), isInstanceAdmin: true },
      select: { id: true },
    });
    const space = await createSpaceWithDefaults(tx, {
      name: input.spaceName.trim(),
      slug: input.spaceSlug,
      ownerId: user.id,
      timezone: input.timezone,
      currency: input.currency,
    });
    await recordAuditEvent({ client: tx, action: "instance.setup_completed", spaceId: space.id, actorId: user.id, targetType: "Space", targetId: space.id, ip: null });
    return { ok: true as const, userId: user.id, spaceSlug: space.slug };
  });
}
