import "server-only";

import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";
import { ACTIVE_LOAN_STATUSES, outstanding } from "@/lib/lending/policy";

const DAY = 86_400_000;
const lineSelect = { quantityRequested: true, quantityApproved: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true, item: { select: { name: true } } } as const;

function itemsSummary(lines: ReadonlyArray<{ item: { name: string } }>) {
  const names = lines.map((line) => line.item.name);
  return names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}

/** Stat tiles, desk queues and recent stock movements for staff. */
export async function staffHome(space: { id: string; timezone: string }, now: Date = new Date()) {
  const active = { spaceId: space.id, status: { in: [...ACTIVE_LOAN_STATUSES] } };
  const [requested, overdue, dueSoon, lowStock, requests, ready, transfersOut, transfersIn, counts, movements] = await Promise.all([
    prisma.loan.count({ where: { spaceId: space.id, status: "REQUESTED" } }),
    prisma.loan.count({ where: { ...active, dueAt: { lt: now } } }),
    prisma.loan.findMany({ where: { ...active, dueAt: { gte: now, lt: new Date(now.getTime() + DAY) } }, select: { dueAt: true } }),
    prisma.item.count({ where: { spaceId: space.id, archivedAt: null, lowStockAlertAt: { not: null } } }),
    prisma.loan.findMany({ where: { spaceId: space.id, status: "REQUESTED" }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, number: true, createdAt: true, borrower: { select: { name: true } }, lines: { select: lineSelect } } }),
    prisma.loan.findMany({ where: { spaceId: space.id, status: "APPROVED" }, orderBy: { approvedAt: "asc" }, take: 5, select: { id: true, number: true, createdAt: true, borrower: { select: { name: true } }, lines: { select: lineSelect } } }),
    prisma.transfer.findMany({ where: { sourceSpaceId: space.id, status: { in: ["REQUESTED", "APPROVED"] } }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, number: true, status: true, destSpaceId: true, destSpace: { select: { name: true } } } }),
    prisma.transfer.findMany({ where: { destSpaceId: space.id, sourceSpaceId: { not: space.id }, status: { in: ["DISPATCHED", "PARTIALLY_RECEIVED"] } }, orderBy: { dispatchedAt: "asc" }, take: 5, select: { id: true, number: true, status: true, sourceSpace: { select: { name: true } } } }),
    prisma.stockCount.findMany({ where: { spaceId: space.id, status: { in: ["IN_PROGRESS", "SUBMITTED"] } }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true, number: true, name: true, status: true } }),
    prisma.stockMovement.findMany({
      where: { spaceId: space.id, type: { notIn: ["RESERVE", "RELEASE"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, type: true, quantity: true, createdAt: true, item: { select: { id: true, name: true, unit: { select: { symbol: true } } } } },
    }),
  ]);
  const today = formatDate(now, space.timezone);
  const dueToday = dueSoon.filter((loan) => formatDate(loan.dueAt, space.timezone) === today).length;
  const loanRow = (loan: (typeof requests)[number]) => ({ id: loan.id, number: loan.number, borrower: loan.borrower.name, items: itemsSummary(loan.lines), createdAt: loan.createdAt });
  return {
    stats: { requested, dueToday, overdue, lowStock },
    requests: requests.map(loanRow),
    ready: ready.map(loanRow),
    transfersOut: transfersOut.map((t) => ({ id: t.id, number: t.number, status: t.status, other: t.destSpaceId === space.id ? null : t.destSpace.name })),
    transfersIn: transfersIn.map((t) => ({ id: t.id, number: t.number, status: t.status, other: t.sourceSpace.name })),
    counts,
    movements: movements.map((m) => ({ id: m.id, type: m.type, quantity: m.quantity, createdAt: m.createdAt, itemId: m.item.id, itemName: m.item.name, unit: m.item.unit?.symbol ?? null })),
  };
}

/** A member's own picture: what they have out, what is overdue, open requests and their standing. */
export async function memberHome(spaceId: string, userId: string, now: Date = new Date()) {
  const [membership, loans] = await Promise.all([
    prisma.membership.findUnique({ where: { userId_spaceId: { userId, spaceId } }, select: { borrowingStatus: true, borrowingNote: true, memberNumber: true } }),
    prisma.loan.findMany({
      where: { spaceId, borrowerId: userId, status: { in: ["REQUESTED", "APPROVED", "ISSUED", "PARTIALLY_RETURNED"] } },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: { id: true, number: true, status: true, dueAt: true, lines: { select: lineSelect } },
    }),
  ]);
  const rows = loans.map((loan) => ({
    id: loan.id,
    number: loan.number,
    status: loan.status,
    dueAt: loan.dueAt,
    items: itemsSummary(loan.lines),
    out: loan.lines.reduce((sum, line) => sum + outstanding(line), 0),
    overdue: (ACTIVE_LOAN_STATUSES as readonly string[]).includes(loan.status) && loan.dueAt < now,
  }));
  return {
    standing: { status: membership?.borrowingStatus ?? "GOOD", note: membership?.borrowingNote ?? null },
    active: rows.filter((row) => row.status === "ISSUED" || row.status === "PARTIALLY_RETURNED"),
    pending: rows.filter((row) => row.status === "REQUESTED" || row.status === "APPROVED"),
    overdue: rows.filter((row) => row.overdue).length,
  };
}

export type StaffHome = Awaited<ReturnType<typeof staffHome>>;
export type MemberHome = Awaited<ReturnType<typeof memberHome>>;
