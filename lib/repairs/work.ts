import "server-only";

import type { RepairOutcome } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { repairRef } from "@/lib/catalogue/references";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { resolveIncident } from "@/lib/lending/workflow";
import { notifyUsers } from "@/lib/notify";
import type { StoredImage } from "@/lib/storage";
import { addTimeline, lockIssue, managerIds, repairPath, type RepairActor } from "./common";
import { releaseRepairHold } from "./hold";
import { tellTechnician } from "./notify";
import { requestExpiry } from "./tokens";

export const MAX_REPAIR_PHOTOS = 6;

export type WorkInput = {
  spaceId: string;
  issueId: string;
  remarks: string;
  partsUsed: string | null;
  /** What the technician asks for the job, in minor units; null when not known yet. */
  amountAskedMinor: number | null;
  photos: StoredImage[];
  markFixed: boolean;
};

/**
 * The assigned technician (in the app, or through their link) records fix
 * notes, parts, photos and the amount asked, then marks it fixed. A manager
 * may record it on their behalf. Saving keeps an external link alive.
 */
export async function recordRepairWork(tx: Tx, input: WorkInput, actor: RepairActor & { manager?: boolean }) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (issue.status !== "ASSIGNED") throw new DomainError(issue.status === "FIXED" ? "This repair is waiting to be verified." : "This repair isn't being worked on.", "conflict");
  if (!actor.manager && (!actor.technicianId || actor.technicianId !== issue.assignedTechnicianId)) throw new DomainError("That repair wasn't found.", "not_found");
  const remarks = input.remarks.trim();
  if (input.markFixed && !remarks) throw new DomainError("Describe what you fixed before marking it fixed.");
  if (input.amountAskedMinor !== null && (!Number.isSafeInteger(input.amountAskedMinor) || input.amountAskedMinor < 0)) throw new DomainError("Enter the amount you ask, or 0.");
  if ((await tx.repairPhoto.count({ where: { issueId: issue.id, stage: "FIX" } })) + input.photos.length > MAX_REPAIR_PHOTOS) throw new DomainError(`Attach at most ${MAX_REPAIR_PHOTOS} photos of the fix.`);
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { slug: true, repairRequestDays: true } });
  await tx.repairIssue.update({
    where: { id: issue.id },
    data: {
      fixRemarks: remarks.slice(0, 2000) || issue.fixRemarks,
      partsUsed: input.partsUsed?.trim().slice(0, 1000) || issue.partsUsed,
      amountAskedMinor: input.amountAskedMinor ?? issue.amountAskedMinor,
      ...(input.markFixed ? { status: "FIXED" as const, fixedAt: new Date() } : {}),
    },
  });
  if (input.photos.length) await tx.repairPhoto.createMany({ data: input.photos.map((photo) => ({ spaceId: input.spaceId, issueId: issue.id, stage: "FIX", storageKey: photo.storageKey, contentType: photo.contentType, sizeBytes: photo.sizeBytes, sha256: photo.sha256, uploadedById: actor.userId, technicianId: actor.technicianId ?? null })) });
  if (issue.assignedTechnicianId) await tx.repairRequest.updateMany({ where: { issueId: issue.id, technicianId: issue.assignedTechnicianId, status: "ACCEPTED" }, data: { expiresAt: requestExpiry(space.repairRequestDays) } });
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: input.markFixed ? "fixed" : "work", actor, technicianId: issue.assignedTechnicianId, text: input.markFixed ? remarks : null });
  if (input.markFixed) {
    await notifyUsers(tx, input.spaceId, await managerIds(tx, input.spaceId), { kind: "repair.fixed", title: `${repairRef(issue.number)} is fixed: verify it`, body: "Check the fix, then close the repair or reopen it with a reason.", url: repairPath(space.slug, issue.id), email: true }, { excludeUserId: actor.userId });
  }
}

/**
 * A manager checks the fix and closes the repair: fixed units go back in use,
 * scrapped ones are written off (always through the availability module). A
 * linked damaged-item incident is resolved the same way.
 */
export async function closeRepair(tx: Tx, input: { spaceId: string; issueId: string; outcome: RepairOutcome; note: string }, actor: RepairActor) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (input.outcome === "FIXED" && issue.status !== "FIXED") throw new DomainError("Only a repair marked fixed can be verified.", "conflict");
  if (input.outcome === "SCRAPPED" && !["REPORTED", "ASSIGNED", "FIXED"].includes(issue.status)) throw new DomainError("This repair is already finished.", "conflict");
  const note = input.note.trim();
  if (input.outcome === "SCRAPPED" && !note) throw new DomainError("Say why it can't be repaired.");
  const ref = { refType: "RepairIssue", refId: issue.id };
  await releaseRepairHold(tx, issue, input.outcome === "FIXED" ? "fixed" : "scrapped", { userId: actor.userId }, ref);
  await tx.repairRequest.updateMany({ where: { issueId: issue.id, status: "SENT" }, data: { status: "CLOSED", respondedAt: new Date() } });
  await tx.repairIssue.update({ where: { id: issue.id }, data: { status: "CLOSED", outcome: input.outcome, closedAt: new Date(), closedById: actor.userId, closeNote: note.slice(0, 1000) || null } });
  if (issue.incidentId) {
    const incident = await tx.loanIncident.findUnique({ where: { id: issue.incidentId }, select: { status: true } });
    if (incident?.status === "OPEN") {
      await resolveIncident(tx, { spaceId: input.spaceId, incidentId: issue.incidentId, resolution: input.outcome === "FIXED" ? "REPAIRED" : "WRITTEN_OFF", note: `Closed with repair ${repairRef(issue.number)}${note ? `: ${note}` : "."}` }, { userId: actor.userId });
    }
  }
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: "closed", actor, text: input.outcome === "SCRAPPED" ? `Scrapped: ${note}` : note || null });
  await recordAuditEvent({ client: tx, action: "repair.closed", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: issue.id, metadata: { outcome: input.outcome } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "issue.resolved", data: { issueId: issue.id, reference: repairRef(issue.number), itemId: issue.itemId, assetId: issue.assetId, outcome: input.outcome } });
}

/** The fix didn't hold: back to the technician with a reason. */
export async function reopenRepair(tx: Tx, input: { spaceId: string; issueId: string; reason: string }, actor: RepairActor) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (issue.status !== "FIXED") throw new DomainError("Only a repair marked fixed can be reopened.", "conflict");
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Say what still needs doing.");
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { id: true, slug: true, name: true, repairRequestDays: true } });
  await tx.repairIssue.update({ where: { id: issue.id }, data: { status: "ASSIGNED", fixedAt: null } });
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: "reopened", actor, text: reason });
  if (issue.assignedTechnicianId) {
    await tx.repairRequest.updateMany({ where: { issueId: issue.id, technicianId: issue.assignedTechnicianId, status: "ACCEPTED" }, data: { expiresAt: requestExpiry(space.repairRequestDays) } });
    const technician = await tx.technician.findUniqueOrThrow({ where: { id: issue.assignedTechnicianId } });
    await tellTechnician(tx, space, issue.id, technician, { kind: "repair.reopened", title: `${repairRef(issue.number)} was reopened`, body: `${reason} Open your repair link (or the repair in the app) to continue.` });
  }
}
