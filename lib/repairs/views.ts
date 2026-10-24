import "server-only";

import type { RepairStatus } from "@prisma/client";
import { repairRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { formatDayTime, formatRelativeTime } from "@/lib/format/datetime";
import { isTheirRepair, visibleRepairs, type RepairViewer } from "./access";
import { effectiveRequestStatus, payoutState } from "./labels";

/** Read models for the repair pages. Money is included only for managers, and for a technician only their own amount. */

export const REPAIR_FILTERS = [
  { key: "open", label: "Open", statuses: ["REPORTED", "ASSIGNED", "FIXED"] },
  { key: "waiting", label: "Waiting", statuses: ["REPORTED"] },
  { key: "in-repair", label: "Being repaired", statuses: ["ASSIGNED"] },
  { key: "to-verify", label: "To verify", statuses: ["FIXED"] },
  { key: "closed", label: "Closed", statuses: ["CLOSED", "CANCELLED"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly RepairStatus[] }[];

export type RepairFilter = (typeof REPAIR_FILTERS)[number];

export function repairFilter(value: unknown): RepairFilter {
  return REPAIR_FILTERS.find((filter) => filter.key === value) ?? REPAIR_FILTERS[0];
}

async function names(userIds: (string | null)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((user) => [user.id, user.name ?? user.email]));
}

export async function listRepairs(space: { id: string; timezone: string }, viewer: RepairViewer, filter: RepairFilter, q = "") {
  const where = { ...visibleRepairs(space.id, viewer), status: { in: [...filter.statuses] }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { item: { name: { contains: q, mode: "insensitive" as const } } }] } : {}) };
  const [issues, counts] = await Promise.all([
    prisma.repairIssue.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      take: 200,
      select: {
        id: true, number: true, title: true, severity: true, status: true, createdAt: true, assignedTechnicianId: true, amountAskedMinor: true, approvedMinor: true,
        item: { select: { name: true } }, asset: { select: { assetTag: true } }, technician: { select: { name: true } },
        payouts: { select: { amountMinor: true } }, requests: { select: { status: true, expiresAt: true, technicianId: true } },
      },
    }),
    prisma.repairIssue.groupBy({ by: ["status"], where: visibleRepairs(space.id, viewer), _count: { _all: true } }),
  ]);
  return {
    counts: Object.fromEntries(REPAIR_FILTERS.map((entry) => [entry.key, counts.filter((row) => (entry.statuses as readonly string[]).includes(row.status)).reduce((sum, row) => sum + row._count._all, 0)])),
    rows: issues.map((issue) => {
      const paid = issue.payouts.reduce((sum, payout) => sum + payout.amountMinor, 0);
      const mine = isTheirRepair(viewer, issue);
      const myRequest = viewer.technicianId ? issue.requests.find((request) => request.technicianId === viewer.technicianId) : undefined;
      return {
        id: issue.id,
        reference: repairRef(issue.number),
        title: issue.title,
        item: issue.item.name,
        assetTag: issue.asset?.assetTag ?? null,
        severity: issue.severity,
        status: issue.status,
        technician: issue.technician?.name ?? null,
        waitingOn: issue.requests.filter((request) => effectiveRequestStatus(request) === "SENT").length,
        myRequest: myRequest ? effectiveRequestStatus(myRequest) : null,
        reportedLabel: formatRelativeTime(issue.createdAt, space.timezone),
        money: viewer.pay || mine ? { askedMinor: issue.amountAskedMinor, approvedMinor: viewer.pay ? issue.approvedMinor : null, payout: payoutState(issue.approvedMinor, paid) } : null,
      };
    }),
  };
}

export type RepairListRow = Awaited<ReturnType<typeof listRepairs>>["rows"][number];

const MONEY_EVENTS = new Set(["approved", "paid"]);

/** One repair for a signed-in viewer, or null when they may not see it. */
export async function repairDetail(space: { id: string; slug: string; timezone: string }, viewer: RepairViewer, issueId: string) {
  const issue = await prisma.repairIssue.findFirst({
    where: { AND: [visibleRepairs(space.id, viewer), { id: issueId }] },
    include: {
      item: { select: { id: true, name: true, sku: true, tracking: true } },
      asset: { select: { id: true, assetTag: true, status: true } },
      technician: { select: { id: true, name: true, kind: true } },
      incident: { select: { id: true, loanId: true } },
      photos: { orderBy: { createdAt: "asc" }, select: { id: true, stage: true } },
      events: { orderBy: { createdAt: "asc" } },
      requests: { orderBy: { sentAt: "asc" }, include: { technician: { select: { name: true, kind: true } } } },
      payouts: { orderBy: { paidAt: "asc" } },
      purchases: { select: { id: true, number: true, name: true, status: true } },
    },
  });
  if (!issue) return null;
  const mine = isTheirRepair(viewer, issue);
  const location = issue.heldLocationId ? await prisma.location.findUnique({ where: { id: issue.heldLocationId }, select: { code: true, name: true } }) : null;
  const technicianNames = new Map(issue.requests.map((request) => [request.technicianId, request.technician.name]));
  const people = await names([issue.reportedById, issue.closedById, ...issue.events.map((event) => event.actorId)]);
  const paid = issue.payouts.reduce((sum, payout) => sum + payout.amountMinor, 0);
  const myRequest = viewer.technicianId ? issue.requests.find((request) => request.technicianId === viewer.technicianId) : undefined;
  const at = (date: Date) => formatDayTime(date, space.timezone);
  return {
    id: issue.id,
    reference: repairRef(issue.number),
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    status: issue.status,
    outcome: issue.outcome,
    item: issue.item,
    asset: issue.asset,
    incidentLoanId: issue.incident?.loanId ?? null,
    held: issue.heldQuantity > 0 ? { quantity: issue.heldQuantity, location: location ? `${location.code} · ${location.name}` : null } : null,
    reportedBy: issue.reportedById ? people.get(issue.reportedById) ?? "Former member" : null,
    reportedLabel: at(issue.createdAt),
    technician: issue.technician,
    fix: { remarks: issue.fixRemarks, partsUsed: issue.partsUsed, fixedLabel: issue.fixedAt ? at(issue.fixedAt) : null },
    closeNote: issue.closeNote,
    photos: issue.photos,
    timeline: issue.events
      .filter((event) => viewer.pay || !MONEY_EVENTS.has(event.kind))
      .map((event) => ({ id: event.id, kind: event.kind, when: at(event.createdAt), who: event.actorId ? people.get(event.actorId) ?? "Former member" : event.technicianId ? technicianNames.get(event.technicianId) ?? "Technician" : "Space Works", technician: event.technicianId ? technicianNames.get(event.technicianId) ?? null : null, channel: event.channel, text: event.text })),
    requests: viewer.manage ? issue.requests.map((request) => ({ id: request.id, technicianId: request.technicianId, technician: request.technician.name, external: request.technician.kind === "EXTERNAL", status: effectiveRequestStatus(request), channels: request.channels, sentLabel: at(request.sentAt) })) : [],
    myRequest: myRequest ? { id: myRequest.id, status: effectiveRequestStatus(myRequest) } : null,
    mine,
    money: viewer.pay || mine ? {
      askedMinor: issue.amountAskedMinor,
      // A technician sees only the amount they asked and whether it is paid.
      approvedMinor: viewer.pay ? issue.approvedMinor : null,
      paidMinor: viewer.pay ? paid : null,
      payout: payoutState(issue.approvedMinor, paid),
      approvalNote: viewer.pay ? issue.approvalNote : null,
      payouts: viewer.pay ? issue.payouts.map((payout) => ({ id: payout.id, amountMinor: payout.amountMinor, method: payout.method, reference: payout.reference, paidLabel: at(payout.paidAt), note: payout.note })) : [],
    } : null,
    purchases: viewer.viewAll ? issue.purchases : [],
  };
}

export type RepairDetail = NonNullable<Awaited<ReturnType<typeof repairDetail>>>;
