import "server-only";

import type { RepairSeverity } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef, repairRef } from "@/lib/catalogue/references";
import { nextSpaceSequence } from "@/lib/counters";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { notifyUsers } from "@/lib/notify";
import type { StoredImage } from "@/lib/storage";
import { addTimeline, lockIssue, managerIds, repairPath, type RepairActor } from "./common";
import { adoptIncidentHold, holdForRepair, releaseRepairHold, type Hold } from "./hold";

export type ReportInput = {
  spaceId: string;
  itemId: string;
  assetId: string | null;
  title: string;
  description: string;
  severity: RepairSeverity;
  /** Staff only: take the unit(s) out of use while it is repaired. */
  takeOutOfUse: boolean;
  quantity: number;
  locationId: string | null;
  photos: StoredImage[];
};

async function createIssue(tx: Tx, input: Omit<ReportInput, "takeOutOfUse" | "quantity" | "locationId"> & { incidentId?: string | null; hold: (issueRef: { refType: string; refId: string }) => Promise<Hold> }, actor: RepairActor) {
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { slug: true } });
  const number = await nextSpaceSequence(tx, input.spaceId, "repair");
  const issue = await tx.repairIssue.create({
    data: { spaceId: input.spaceId, number, itemId: input.itemId, assetId: input.assetId, incidentId: input.incidentId ?? null, title: input.title.slice(0, 120), description: input.description.slice(0, 2000), severity: input.severity, reportedById: actor.userId },
  });
  const hold = await input.hold({ refType: "RepairIssue", refId: issue.id });
  if (hold.heldQuantity > 0) await tx.repairIssue.update({ where: { id: issue.id }, data: hold });
  if (input.photos.length) await tx.repairPhoto.createMany({ data: input.photos.map((photo) => ({ spaceId: input.spaceId, issueId: issue.id, stage: "REPORT", storageKey: photo.storageKey, contentType: photo.contentType, sizeBytes: photo.sizeBytes, sha256: photo.sha256, uploadedById: actor.userId })) });
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: "reported", actor, text: hold.heldQuantity > 0 ? `Taken out of use: ${hold.heldQuantity}` : null });
  await recordAuditEvent({ client: tx, action: "repair.reported", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: issue.id, metadata: { itemId: input.itemId, severity: input.severity, held: hold.heldQuantity } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "issue.reported", data: { issueId: issue.id, reference: repairRef(number), itemId: input.itemId, assetId: input.assetId, severity: input.severity } });
  await notifyUsers(tx, input.spaceId, await managerIds(tx, input.spaceId), { kind: "repair.reported", title: `${repairRef(number)}: ${input.title.slice(0, 80)}`, body: "Choose technicians to send it to, or assign one.", url: repairPath(space.slug, issue.id), email: true }, { excludeUserId: actor.userId });
  return issue;
}

/** Report a damaged or broken item or asset. Members report; staff may also take it out of use. */
export async function reportIssue(tx: Tx, input: ReportInput, actor: RepairActor) {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title) throw new DomainError("Say in a few words what is wrong.");
  if (!description) throw new DomainError("Describe the problem so a technician knows what to bring.");
  const item = await tx.item.findFirst({ where: { id: input.itemId, spaceId: input.spaceId, archivedAt: null }, select: { id: true, tracking: true } });
  if (!item) throw new DomainError("That item wasn't found.", "not_found");
  if (input.assetId && !(await tx.asset.findFirst({ where: { id: input.assetId, spaceId: input.spaceId, itemId: item.id }, select: { id: true } }))) throw new DomainError("That asset wasn't found.", "not_found");
  if (input.takeOutOfUse && !input.assetId) {
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new DomainError("Enter how many to take out of use.");
    if (!input.locationId || !(await tx.location.findFirst({ where: { id: input.locationId, spaceId: input.spaceId }, select: { id: true } }))) throw new DomainError("Choose where the damaged stock is.");
  }
  return createIssue(tx, {
    ...input,
    title,
    description,
    hold: (ref) => (input.takeOutOfUse ? holdForRepair(tx, { spaceId: input.spaceId, itemId: item.id, assetId: input.assetId, quantity: input.quantity, locationId: input.locationId }, { userId: actor.userId }, ref) : Promise.resolve({ heldQuantity: 0, heldLocationId: null, holdAdopted: false })),
  }, actor);
}

/** Send a damaged-item incident to repair. Units already on the repair shelf are adopted, not held twice. */
export async function reportFromIncident(tx: Tx, input: { spaceId: string; incidentId: string; severity: RepairSeverity }, actor: RepairActor) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "LoanIncident" WHERE "id" = ${input.incidentId} AND "spaceId" = ${input.spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That incident wasn't found.", "not_found");
  const incident = await tx.loanIncident.findUniqueOrThrow({ where: { id: input.incidentId }, include: { line: { select: { itemId: true, locationId: true } }, loan: { select: { number: true } }, repair: { select: { id: true, status: true } } } });
  if (incident.kind !== "DAMAGED" || incident.status !== "OPEN") throw new DomainError("Only an open damaged-item incident can go to repair.", "conflict");
  if (incident.repair && incident.repair.status !== "CANCELLED") throw new DomainError("This incident is already in repair.", "conflict");
  if (incident.repair) await tx.repairIssue.update({ where: { id: incident.repair.id }, data: { incidentId: null } });
  return createIssue(tx, {
    spaceId: input.spaceId,
    itemId: incident.line.itemId,
    assetId: incident.assetId,
    incidentId: incident.id,
    title: `Damaged on loan ${loanRef(incident.loan.number)}`,
    description: incident.description,
    severity: input.severity,
    photos: [],
    hold: () => adoptIncidentHold(tx, incident),
  }, actor);
}

/** A manager calls a repair off. Held stock goes back in use (or back to its incident); open requests close. */
export async function cancelIssue(tx: Tx, input: { spaceId: string; issueId: string; reason: string }, actor: RepairActor) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (issue.status === "CLOSED" || issue.status === "CANCELLED") throw new DomainError("This repair is already finished.", "conflict");
  if (await tx.repairPayout.count({ where: { issueId: issue.id }, take: 1 })) throw new DomainError("This repair has payouts. Verify and close it instead.", "conflict");
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Say why the repair is cancelled.");
  await releaseRepairHold(tx, issue, "cancelled", { userId: actor.userId }, { refType: "RepairIssue", refId: issue.id });
  await tx.repairRequest.updateMany({ where: { issueId: issue.id, status: "SENT" }, data: { status: "CLOSED", respondedAt: new Date() } });
  await tx.repairIssue.update({ where: { id: issue.id }, data: { status: "CANCELLED", closedAt: new Date(), closedById: actor.userId, closeNote: reason.slice(0, 1000) } });
  await addTimeline(tx, { spaceId: issue.spaceId, issueId: issue.id, kind: "cancelled", actor, text: reason });
  await recordAuditEvent({ client: tx, action: "repair.cancelled", spaceId: issue.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: issue.id });
}
