import "server-only";
import type { Actor } from "@spaceworks-hq/agents/helper";
import { DomainError } from "@spaceworks-hq/agents/helper";
import { prisma, type DbClient } from "@/lib/db";

/** Reload membership for every read/write, including a confirmation replay. */
export async function resolveAgentActor(actor: Actor, client: DbClient = prisma) {
  const membership = await client.membership.findUnique({
    where: { userId_spaceId: { userId: actor.id, spaceId: actor.tenantId } },
    include: { space: true, user: { select: { id: true, name: true, disabledAt: true } } },
  });
  const currentRole = membership?.role.toLowerCase();
  if (!membership || membership.status !== "ACTIVE" || membership.user.disabledAt || membership.space.archivedAt ||
      !["manager", "staff", "member"].includes(currentRole ?? "") || actor.role !== currentRole) {
    throw new DomainError("FORBIDDEN", "Your current space membership does not permit this request.", 403);
  }
  return membership;
}

export function policyVersion(space: { updatedAt: Date }) {
  return space.updatedAt.getTime();
}
