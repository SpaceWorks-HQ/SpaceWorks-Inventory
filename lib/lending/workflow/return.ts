import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { bringBackAsset, putBack, recordLossWhileOut } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { addIncidentCharge, addLateFee } from "@/lib/payments/charges";
import { syncAutomaticRestriction } from "../access";
import { outstanding } from "../policy";
import { lockLoan, loanUrl, type Actor, type LockedLoan } from "./common";
import { resolveScans } from "./scans";

export type ReturnLine = { lineId: string; returned: number; damaged: number; lost: number; locationId?: string | null };

async function openIncident(tx: Tx, loan: LockedLoan, line: LockedLoan["lines"][number], kind: "LOST" | "DAMAGED", quantity: number, description: string, actor: Actor) {
  const incident = await tx.loanIncident.create({
    data: { spaceId: loan.spaceId, loanId: loan.id, lineId: line.id, borrowerId: loan.borrowerId, assetId: line.assetId, kind, quantity, description: description.slice(0, 1000) || (kind === "LOST" ? "Not returned" : "Returned damaged") },
  });
  await addIncidentCharge(tx, { incidentId: incident.id });
  await recordAuditEvent({ client: tx, action: "incident.opened", spaceId: loan.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "LoanIncident", targetId: incident.id, metadata: { kind, quantity } });
  await emitEvent(tx, { spaceId: loan.spaceId, type: "incident.opened", data: { incidentId: incident.id, loanId: loan.id, kind, quantity, itemId: line.itemId } });
}

/**
 * Take items back (all or part). Every returned or damaged serialized unit
 * must be scanned; quantity items need their label or the loan's container;
 * a loan packed in a container needs that container scanned. Remarks and
 * photos are always required. Damaged or lost units open incidents (and
 * charges), which can restrict the borrower until resolved.
 */
export async function returnLoan(tx: Tx, input: { spaceId: string; loanId: string; scannedCodes: string[]; lines: ReturnLine[]; evidence: EvidenceInput; byBorrowerId?: string }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "return");
  if (input.byBorrowerId && (loan.borrowerId !== input.byBorrowerId || !loan.selfCheckout)) throw new DomainError("Return this loan at the desk.", "forbidden");
  const scans = await resolveScans(tx, input.spaceId, input.scannedCodes);
  const byId = new Map(loan.lines.map((line) => [line.id, line]));
  if (new Set(input.lines.map((l) => l.lineId)).size !== input.lines.length) throw new DomainError("List each line once.", "invalid");
  const physical = input.lines.reduce((sum, l) => sum + l.returned + l.damaged, 0);
  if (input.lines.reduce((sum, l) => sum + l.returned + l.damaged + l.lost, 0) === 0) throw new DomainError("Mark at least one item as returned, damaged or lost.", "invalid");
  if (loan.containerId && physical > 0 && !scans.containers.some((c) => c.id === loan.containerId)) throw new DomainError("Scan the container this loan was packed in.", "invalid");
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId: input.spaceId, kind: "RETURN", loanId: loan.id, actorId: actor.userId, minPhotos: loan.space.minEvidencePhotos, remarksRequired: true });
  const ref = { refType: "Loan", refId: loan.id };
  for (const change of input.lines) {
    const line = byId.get(change.lineId);
    if (!line) throw new DomainError("A line isn't on this loan.", "invalid");
    if ([change.returned, change.damaged, change.lost].some((n) => !Number.isSafeInteger(n) || n < 0)) throw new DomainError("Quantities must be whole numbers.", "invalid");
    const resolving = change.returned + change.damaged + change.lost;
    if (resolving === 0) continue;
    if (resolving > outstanding(line)) throw new DomainError(`Only ${outstanding(line)} of ${line.item.name} are still out.`, "invalid");
    const locationId = change.locationId ?? line.locationId;
    if (change.returned + change.damaged > 0) {
      if (!locationId || !(await tx.location.findFirst({ where: { id: locationId, spaceId: input.spaceId, archivedAt: null }, select: { id: true } }))) throw new DomainError(`Choose where ${line.item.name} goes back.`, "invalid");
    }
    if (line.assetId) {
      const outcome = change.lost ? "missing" : change.damaged ? "damaged" : "returned";
      if (outcome !== "missing" && !scans.assets.has(line.assetId)) throw new DomainError(`Scan ${line.asset?.assetTag ?? line.item.name} to return it.`, "invalid");
      await bringBackAsset(tx, { assetId: line.assetId, spaceId: input.spaceId, itemId: line.itemId, locationId: locationId ?? "", outcome, type: "RETURN", expect: "ON_LOAN" }, actor, ref);
    } else {
      if (change.returned + change.damaged > 0 && !scans.items.has(line.itemId) && !loan.containerId) throw new DomainError(`Scan the label of ${line.item.name}.`, "invalid");
      if (change.returned + change.damaged > 0) await putBack(tx, { spaceId: input.spaceId, itemId: line.itemId, locationId: locationId!, good: change.returned, damaged: change.damaged, type: "RETURN" }, actor, ref);
      if (change.lost > 0) await recordLossWhileOut(tx, { spaceId: input.spaceId, itemId: line.itemId, quantity: change.lost, type: "LOSS" }, actor, ref);
    }
    await tx.loanLine.update({ where: { id: line.id }, data: { quantityReturned: { increment: change.returned }, quantityDamaged: { increment: change.damaged }, quantityLost: { increment: change.lost } } });
    if (change.damaged > 0) await openIncident(tx, loan, line, "DAMAGED", change.damaged, input.evidence.remarks, actor);
    if (change.lost > 0) await openIncident(tx, loan, line, "LOST", change.lost, input.evidence.remarks, actor);
  }
  const lines = await tx.loanLine.findMany({ where: { loanId: loan.id } });
  const done = lines.every((line) => outstanding(line) === 0);
  const hadIssue = lines.some((line) => line.quantityDamaged + line.quantityLost > 0);
  const now = new Date();
  const status = !done ? "PARTIALLY_RETURNED" : hadIssue ? "CLOSED_WITH_ISSUE" : "RETURNED";
  await tx.loan.update({ where: { id: loan.id }, data: { status, ...(done ? { returnedAt: now, closedAt: now } : {}) } });
  if (done) await addLateFee(tx, { loanId: loan.id, returnedAt: now });
  await syncAutomaticRestriction(tx, { spaceId: input.spaceId, userId: loan.borrowerId, now });
  await recordAuditEvent({ client: tx, action: `loan.${status === "PARTIALLY_RETURNED" ? "partially_returned" : status === "RETURNED" ? "returned" : "closed_with_issue"}`, spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Loan", targetId: loan.id, metadata: { evidenceId: evidence.id, selfReturn: Boolean(input.byBorrowerId) } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.returned", data: { loanId: loan.id, reference: loanRef(loan.number), status, complete: done } });
  const borrowerUrl = loanUrl(loan.space.slug, loan.id, "borrower");
  await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.returned", title: done ? `${loanRef(loan.number)} is closed` : `Part of ${loanRef(loan.number)} is back`, body: hadIssue ? "Some items came back damaged or missing; staff will be in touch." : "Thanks for bringing things back.", url: borrowerUrl, email: done }, { excludeUserId: input.byBorrowerId ? null : undefined });
  if (input.byBorrowerId) await notifyUsers(tx, input.spaceId, await staffIds(tx, input.spaceId), { kind: "loan.self_returned", title: `${loan.borrower.name ?? "A member"} self-returned ${loanRef(loan.number)}`, url: loanUrl(loan.space.slug, loan.id, "staff") });
  return { status };
}
