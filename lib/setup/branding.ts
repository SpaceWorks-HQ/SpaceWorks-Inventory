import "server-only";

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { notFound } from "@/lib/domainError";

/**
 * Point `Space.logoKey` at a newly stored logo (or clear it) and audit it.
 * Returns the previous key so the caller can delete that object after the
 * change has committed.
 */
export async function replaceSpaceLogo(spaceId: string, logoKey: string | null, actorId: string | null): Promise<{ previousKey: string | null }> {
  return prisma.$transaction(async (tx) => {
    const space = await tx.space.findUnique({ where: { id: spaceId }, select: { logoKey: true } });
    if (!space) notFound("space");
    await tx.space.update({ where: { id: spaceId }, data: { logoKey } });
    await recordAuditEvent({ client: tx, action: logoKey ? "space.logo_updated" : "space.logo_removed", spaceId, actorId, targetType: "Space", targetId: spaceId });
    return { previousKey: space.logoKey };
  });
}
