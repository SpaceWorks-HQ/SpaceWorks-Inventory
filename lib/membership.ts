import "server-only";

import type { Membership, MembershipStatus, SpaceRole } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { assignableRoles, canManageMembers } from "@/lib/roles";

type Result = { ok: true } | { ok: false; error: string };

export const LAST_MANAGER_ERROR = "A space needs at least one active inventory manager. Make someone else an inventory manager first.";

/**
 * Lock the space's manager rows and report whether another active manager
 * remains besides `excludingMembershipId`. Row locks serialise concurrent
 * demotions/removals so two managers cannot remove each other at once.
 */
async function hasAnotherActiveManager(tx: Tx, spaceId: string, excludingMembershipId: string) {
  const managers = await tx.$queryRaw<Array<{ id: string; status: MembershipStatus }>>`
    SELECT "id", "status" FROM "Membership"
    WHERE "spaceId" = ${spaceId} AND "role" = 'MANAGER'
    ORDER BY "id"
    FOR UPDATE
  `;
  return managers.some((manager) => manager.id !== excludingMembershipId && manager.status === "ACTIVE");
}

async function loadTarget(tx: Tx, spaceId: string, membershipId: string) {
  return tx.membership.findFirst({ where: { id: membershipId, spaceId } });
}

/** Change a member's role. `actor` is the caller's own membership (already resolved server-side). */
export async function changeMemberRole(input: { actor: Membership; membershipId: string; role: SpaceRole }): Promise<Result> {
  const { actor } = input;
  if (!assignableRoles(actor).includes(input.role)) return { ok: false, error: "You can't give that role." };
  return prisma.$transaction(async (tx) => {
    const target = await loadTarget(tx, actor.spaceId, input.membershipId);
    if (!target) return { ok: false as const, error: "That member wasn't found." };
    if (!canManageMembers(actor)) return { ok: false as const, error: "You can't change this member's role." };
    if (target.role === input.role) return { ok: true as const };
    if (target.role === "MANAGER" && !(await hasAnotherActiveManager(tx, actor.spaceId, target.id))) {
      return { ok: false as const, error: LAST_MANAGER_ERROR };
    }
    await tx.membership.update({ where: { id: target.id }, data: { role: input.role } });
    await recordAuditEvent({
      client: tx,
      action: "member.role_changed",
      spaceId: actor.spaceId,
      actorId: actor.userId,
      targetType: "Membership",
      targetId: target.id,
      metadata: { from: target.role, to: input.role },
    });
    return { ok: true as const };
  });
}

/** Suspend or reactivate a member. Suspended members lose access immediately. */
export async function setMemberStatus(input: { actor: Membership; membershipId: string; status: MembershipStatus }): Promise<Result> {
  const { actor } = input;
  return prisma.$transaction(async (tx) => {
    const target = await loadTarget(tx, actor.spaceId, input.membershipId);
    if (!target) return { ok: false as const, error: "That member wasn't found." };
    if (target.id === actor.id) return { ok: false as const, error: "You can't suspend yourself." };
    if (!canManageMembers(actor)) return { ok: false as const, error: "You can't change this member." };
    if (target.status === input.status) return { ok: true as const };
    if (input.status === "SUSPENDED" && target.role === "MANAGER" && !(await hasAnotherActiveManager(tx, actor.spaceId, target.id))) {
      return { ok: false as const, error: LAST_MANAGER_ERROR };
    }
    await tx.membership.update({ where: { id: target.id }, data: { status: input.status } });
    await recordAuditEvent({
      client: tx,
      action: input.status === "SUSPENDED" ? "member.suspended" : "member.reactivated",
      spaceId: actor.spaceId,
      actorId: actor.userId,
      targetType: "Membership",
      targetId: target.id,
    });
    return { ok: true as const };
  });
}

/** Remove a member (or leave, when `membershipId` is the actor's own). */
export async function removeMember(input: { actor: Membership; membershipId: string }): Promise<Result> {
  const { actor } = input;
  return prisma.$transaction(async (tx) => {
    const target = await loadTarget(tx, actor.spaceId, input.membershipId);
    if (!target) return { ok: false as const, error: "That member wasn't found." };
    const leaving = target.id === actor.id;
    if (!leaving && !canManageMembers(actor)) return { ok: false as const, error: "You can't remove this member." };
    if (target.role === "MANAGER" && !(await hasAnotherActiveManager(tx, actor.spaceId, target.id))) {
      return { ok: false as const, error: LAST_MANAGER_ERROR };
    }
    await tx.membership.delete({ where: { id: target.id } });
    await recordAuditEvent({
      client: tx,
      action: leaving ? "member.left" : "member.removed",
      spaceId: actor.spaceId,
      actorId: actor.userId,
      targetType: "Membership",
      targetId: target.id,
      metadata: { role: target.role },
    });
    return { ok: true as const };
  });
}
