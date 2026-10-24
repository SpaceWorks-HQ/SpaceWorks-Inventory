import "server-only";

import type { Membership, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canManageRepairs, canPayRepairs, canViewRepairs } from "@/lib/roles";

/**
 * Who sees which repairs. Inventory managers and staff see every repair of
 * the space (only managers see money); a technician sees the repairs they
 * were asked to take or hold; a member sees what they reported. Anything
 * else is the same not-found as an unknown id.
 */

export type RepairViewer = {
  userId: string;
  manage: boolean;
  pay: boolean;
  viewAll: boolean;
  /** The viewer's own directory entry, when they are a technician here. */
  technicianId: string | null;
  /** Technicians need an authenticator app before they can act. */
  needsMfa: boolean;
};

export async function repairViewer(spaceId: string, user: { id: string }, membership: Pick<Membership, "role">): Promise<RepairViewer> {
  const [technician, account] = await Promise.all([
    prisma.technician.findUnique({ where: { spaceId_userId: { spaceId, userId: user.id } }, select: { id: true, active: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { mfaEnabledAt: true } }),
  ]);
  return {
    userId: user.id,
    manage: canManageRepairs(membership),
    pay: canPayRepairs(membership),
    viewAll: canViewRepairs(membership),
    technicianId: technician?.id ?? null,
    needsMfa: membership.role === "TECHNICIAN" && !account?.mfaEnabledAt,
  };
}

/** The repairs a viewer may see, as a where clause (always inside the space). */
export function visibleRepairs(spaceId: string, viewer: RepairViewer): Prisma.RepairIssueWhereInput {
  if (viewer.viewAll) return { spaceId };
  const mine: Prisma.RepairIssueWhereInput[] = [{ reportedById: viewer.userId }];
  if (viewer.technicianId) mine.push({ assignedTechnicianId: viewer.technicianId }, { requests: { some: { technicianId: viewer.technicianId } } });
  return { spaceId, OR: mine };
}

/** Is this the technician holding (or asked to take) the repair? */
export function isTheirRepair(viewer: RepairViewer, issue: { assignedTechnicianId: string | null }) {
  return viewer.technicianId !== null && issue.assignedTechnicianId === viewer.technicianId;
}
