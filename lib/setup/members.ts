import "server-only";

import type { BorrowingStatus, MembershipStatus, Prisma, SpaceRole } from "@prisma/client";
import { prisma } from "@/lib/db";

export type MemberListRow = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: SpaceRole;
  status: MembershipStatus;
  borrowingStatus: BorrowingStatus;
  borrowingNote: string | null;
  borrowingAuto: boolean;
  memberNumber: string | null;
  joinedAt: Date;
  activeLoans: number;
  openIncidents: number;
};

/**
 * Members of a space for the members page (managers and above), with
 * their borrowing standing, active loans and open incidents. `q` matches
 * name, email or member number.
 */
export async function listMembersForAdmin(spaceId: string, filters: { q?: string | null; role?: SpaceRole | null } = {}): Promise<MemberListRow[]> {
  const q = filters.q?.trim().slice(0, 80);
  const where: Prisma.MembershipWhereInput = {
    spaceId,
    ...(filters.role ? { role: filters.role } : {}),
    ...(q
      ? {
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { memberNumber: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const memberships = await prisma.membership.findMany({
    where,
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    take: 500,
    select: {
      id: true, role: true, status: true, borrowingStatus: true, borrowingNote: true, borrowingAuto: true, memberNumber: true, joinedAt: true,
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  const userIds = memberships.map((m) => m.user.id);
  const [loans, incidents] = userIds.length === 0 ? [[], []] : await Promise.all([
    prisma.loan.groupBy({ by: ["borrowerId"], where: { spaceId, borrowerId: { in: userIds }, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } }, _count: { _all: true } }),
    prisma.loanIncident.groupBy({ by: ["borrowerId"], where: { spaceId, borrowerId: { in: userIds }, status: "OPEN" }, _count: { _all: true } }),
  ]);
  const loanCount = new Map(loans.map((row) => [row.borrowerId, row._count._all]));
  const incidentCount = new Map(incidents.map((row) => [row.borrowerId, row._count._all]));
  return memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.role,
    status: m.status,
    borrowingStatus: m.borrowingStatus,
    borrowingNote: m.borrowingNote,
    borrowingAuto: m.borrowingAuto,
    memberNumber: m.memberNumber,
    joinedAt: m.joinedAt,
    activeLoans: loanCount.get(m.user.id) ?? 0,
    openIncidents: incidentCount.get(m.user.id) ?? 0,
  }));
}

export type InvitationListRow = { id: string; email: string; role: SpaceRole; state: "PENDING" | "EXPIRED"; sentAt: Date; invitedBy: string | null };

/** Invitations still waiting for an answer (pending or expired, not revoked or accepted), newest first. */
export async function listOpenInvitations(spaceId: string, now = new Date()): Promise<InvitationListRow[]> {
  const rows = await prisma.invitation.findMany({
    where: { spaceId, acceptedAt: null, revokedAt: null, createdAt: { gt: new Date(now.getTime() - 90 * 86_400_000) } },
    orderBy: { lastSentAt: "desc" },
    take: 200,
    select: { id: true, email: true, role: true, expiresAt: true, lastSentAt: true, invitedBy: { select: { name: true, email: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    state: row.expiresAt > now ? "PENDING" : "EXPIRED",
    sentAt: row.lastSentAt,
    invitedBy: row.invitedBy ? row.invitedBy.name ?? row.invitedBy.email : null,
  }));
}
