import "server-only";

import { repairRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { payoutState } from "./labels";
import { hashRepairLinkToken, isPlausibleRepairLinkToken } from "./tokens";

/**
 * An external technician's link. It opens one request: to answer while it
 * is waiting, then to record the work while they hold the repair. Closed,
 * expired, withdrawn and unknown links all look the same.
 */

export type LinkRequest = NonNullable<Awaited<ReturnType<typeof findLinkRequest>>>;

export async function findLinkRequest(token: unknown, now = new Date()) {
  if (!isPlausibleRepairLinkToken(token)) return null;
  const request = await prisma.repairRequest.findUnique({
    where: { tokenHash: hashRepairLinkToken(token) },
    include: { technician: { select: { id: true, name: true, kind: true, active: true } }, issue: true, space: { select: { id: true, name: true, slug: true, currency: true, archivedAt: true } } },
  });
  if (!request || request.space.archivedAt || request.technician.kind !== "EXTERNAL" || request.expiresAt <= now) return null;
  const issue = request.issue;
  const holds = issue.assignedTechnicianId === request.technicianId;
  let mode: "respond" | "work" | "waiting";
  if (request.status === "SENT" && issue.status === "REPORTED") mode = "respond";
  else if (request.status === "ACCEPTED" && holds && issue.status === "ASSIGNED") mode = "work";
  else if (request.status === "ACCEPTED" && holds && issue.status === "FIXED") mode = "waiting";
  else return null;
  return { request, issue, space: request.space, technicianId: request.technicianId, mode };
}

/** What the link page shows: the job, never anyone's contact details or the rest of the space. */
export async function linkView(found: LinkRequest) {
  const { issue } = found;
  const [item, location, photos, payouts] = await Promise.all([
    prisma.item.findUniqueOrThrow({ where: { id: issue.itemId }, select: { name: true, brand: true, model: true } }),
    issue.heldLocationId ? prisma.location.findUnique({ where: { id: issue.heldLocationId }, select: { code: true, name: true } }) : null,
    prisma.repairPhoto.findMany({ where: { issueId: issue.id }, orderBy: { createdAt: "asc" }, select: { id: true, stage: true } }),
    prisma.repairPayout.aggregate({ where: { issueId: issue.id, technicianId: found.technicianId }, _sum: { amountMinor: true } }),
  ]);
  const asset = issue.assetId ? await prisma.asset.findUnique({ where: { id: issue.assetId }, select: { assetTag: true } }) : null;
  return {
    mode: found.mode,
    spaceName: found.space.name,
    currency: found.space.currency,
    technicianName: found.request.technician.name,
    reference: repairRef(issue.number),
    title: issue.title,
    description: issue.description,
    severity: issue.severity,
    item: [item.name, item.brand, item.model].filter(Boolean).join(" · "),
    assetTag: asset?.assetTag ?? null,
    location: location ? `${location.code} · ${location.name}` : null,
    fixRemarks: issue.fixRemarks,
    partsUsed: issue.partsUsed,
    amountAskedMinor: issue.amountAskedMinor,
    payout: payoutState(issue.approvedMinor, payouts._sum.amountMinor ?? 0),
    photos,
    expiresAt: found.request.expiresAt,
  };
}

export type LinkView = Awaited<ReturnType<typeof linkView>>;
