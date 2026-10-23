import "server-only";

import { prisma } from "@/lib/db";
import { outstanding } from "@/lib/lending/policy";
import { namesOf } from "./evidence";

/**
 * One loan of one space with everything the desk and the borrower see.
 * `borrowerId` limits it to that member's own loan (member pages); any
 * other loan reads as null, exactly like an unknown id.
 */
export async function loanDetail(spaceId: string, loanId: string, options: { borrowerId?: string } = {}) {
  if (!/^[a-z0-9]{8,40}$/i.test(loanId)) return null;
  const loan = await prisma.loan.findFirst({
    where: { id: loanId, spaceId, ...(options.borrowerId ? { borrowerId: options.borrowerId } : {}) },
    include: {
      borrower: { select: { id: true, name: true, email: true } },
      container: { select: { code: true, name: true, qrCode: true } },
      lines: {
        orderBy: { id: "asc" },
        include: {
          item: { select: { id: true, name: true, sku: true, tracking: true, qrCode: true, consumable: true, unit: { select: { symbol: true } } } },
          asset: { select: { assetTag: true, qrCode: true } },
        },
      },
      incidents: { orderBy: { createdAt: "desc" }, include: { line: { select: { item: { select: { name: true } } } }, asset: { select: { assetTag: true } } } },
    },
  });
  if (!loan) return null;
  const [membership, locations] = await Promise.all([
    prisma.membership.findUnique({ where: { userId_spaceId: { userId: loan.borrowerId, spaceId } }, select: { borrowingStatus: true, borrowingNote: true, memberNumber: true } }),
    prisma.location.findMany({ where: { spaceId, id: { in: loan.lines.map((l) => l.locationId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true, code: true } }),
  ]);
  const locationLabel = new Map(locations.map((l) => [l.id, `${l.name} (${l.code})`]));
  return {
    id: loan.id,
    number: loan.number,
    status: loan.status,
    dueAt: loan.dueAt,
    createdAt: loan.createdAt,
    approvedAt: loan.approvedAt,
    issuedAt: loan.issuedAt,
    returnedAt: loan.returnedAt,
    neededFrom: loan.neededFrom,
    purpose: loan.purpose,
    selfCheckout: loan.selfCheckout,
    renewalCount: loan.renewalCount,
    rejectReason: loan.rejectReason,
    staffNote: loan.staffNote,
    borrower: { id: loan.borrower.id, name: loan.borrower.name?.trim() || loan.borrower.email, email: loan.borrower.email },
    standing: membership ? { status: membership.borrowingStatus, note: membership.borrowingNote, memberNumber: membership.memberNumber } : null,
    container: loan.container ? { code: loan.container.code, name: loan.container.name, qrCode: loan.container.qrCode } : null,
    lines: loan.lines.map((line) => ({
      id: line.id,
      itemId: line.itemId,
      itemName: line.item.name,
      sku: line.item.sku,
      tracking: line.item.tracking,
      itemCode: line.item.qrCode,
      consumable: line.item.consumable,
      unitSymbol: line.item.unit?.symbol ?? null,
      assetTag: line.asset?.assetTag ?? null,
      assetCode: line.asset?.qrCode ?? null,
      locationId: line.locationId,
      locationLabel: line.locationId ? locationLabel.get(line.locationId) ?? null : null,
      requested: line.quantityRequested,
      approved: line.quantityApproved,
      issued: line.quantityIssued,
      returned: line.quantityReturned,
      damaged: line.quantityDamaged,
      lost: line.quantityLost,
      consumed: line.quantityConsumed,
      outstanding: outstanding(line),
    })),
    incidents: loan.incidents.map((incident) => ({
      id: incident.id,
      kind: incident.kind,
      quantity: incident.quantity,
      description: incident.description,
      status: incident.status,
      resolution: incident.resolution,
      resolutionNote: incident.resolutionNote,
      createdAt: incident.createdAt,
      resolvedAt: incident.resolvedAt,
      itemName: incident.line.item.name,
      assetTag: incident.asset?.assetTag ?? null,
      lineLocationId: loan.lines.find((l) => l.id === incident.lineId)?.locationId ?? null,
    })),
  };
}

export type LoanDetail = NonNullable<Awaited<ReturnType<typeof loanDetail>>>;

const ACTION_TITLE: Record<string, string> = {
  "loan.requested": "Requested",
  "loan.approved": "Approved",
  "loan.rejected": "Rejected",
  "loan.cancelled": "Cancelled",
  "loan.issued": "Handed over",
  "loan.self_checkout": "Self-checkout",
  "loan.partially_returned": "Partly returned",
  "loan.returned": "Returned",
  "loan.closed_with_issue": "Closed with an issue",
  "loan.renewed": "Renewed",
  "loan.due_changed": "Due date changed",
  "incident.opened": "Incident opened",
  "incident.resolved": "Incident resolved",
};

/** "payment.recorded" → "Payment recorded" for actions without a set title. */
export function actionTitle(action: string): string {
  if (ACTION_TITLE[action]) return ACTION_TITLE[action];
  const words = action.split(".").slice(-2).join(" ").replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The audit trail of a loan and its incidents, newest first. */
export async function loanTimeline(spaceId: string, loanId: string, incidentIds: string[]) {
  const events = await prisma.auditEvent.findMany({
    where: { spaceId, OR: [{ targetType: "Loan", targetId: loanId }, ...(incidentIds.length ? [{ targetType: "LoanIncident", targetId: { in: incidentIds } }] : [])] },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
    select: { id: true, action: true, actorId: true, createdAt: true, metadata: true },
  });
  const names = await namesOf(events.map((event) => event.actorId));
  return events.map((event) => {
    const meta = (event.metadata ?? {}) as Record<string, unknown>;
    const automatic = meta.automatic === true;
    return {
      id: event.id,
      title: actionTitle(event.action),
      actorName: event.actorId ? names.get(event.actorId) ?? "Someone" : automatic ? "Automatic" : "Space Works",
      createdAt: event.createdAt,
      detail: typeof meta.resolution === "string" ? `Resolution: ${String(meta.resolution).toLowerCase().replace(/_/g, " ")}` : null,
    };
  });
}

/**
 * Codes the desk can expect at issue: asset tags of the serialized items on
 * the loan that are free or held, and the space's active containers.
 */
export async function issueScanCatalog(spaceId: string, serializedItemIds: string[]) {
  const [assets, containers] = await Promise.all([
    serializedItemIds.length
      ? prisma.asset.findMany({ where: { spaceId, itemId: { in: serializedItemIds }, status: { in: ["AVAILABLE", "RESERVED"] } }, select: { qrCode: true, assetTag: true, itemId: true, item: { select: { name: true } } }, take: 500, orderBy: { assetTag: "asc" } })
      : [],
    prisma.container.findMany({ where: { spaceId, archivedAt: null }, select: { code: true, name: true, qrCode: true }, take: 300, orderBy: { code: "asc" } }),
  ]);
  return {
    assets: Object.fromEntries(assets.map((a) => [a.qrCode, { itemId: a.itemId, label: `${a.item.name} · ${a.assetTag}` }])),
    containers: containers.map((c) => ({ code: c.qrCode, label: c.name ? `Container ${c.code} · ${c.name}` : `Container ${c.code}` })),
  };
}
