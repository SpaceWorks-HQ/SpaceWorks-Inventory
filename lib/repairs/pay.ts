import "server-only";

import type { PayoutMethod } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { repairRef } from "@/lib/catalogue/references";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { needsReference } from "@/lib/finance/labels";
import { postRepairPayout } from "@/lib/finance/sources";
import { formatMoney } from "@/lib/format/money";
import { addTimeline, lockIssue, type RepairActor } from "./common";
import { tellTechnician } from "./notify";

/**
 * Paying for a repair (inventory managers only). The manager approves an
 * amount (changing what was asked needs a reason), then records payouts:
 * partial payouts add up to the approved amount. Each payout is append-only
 * and posts one finance-ledger entry in the same transaction.
 */

export async function paidSoFar(tx: Tx, issueId: string) {
  const sum = await tx.repairPayout.aggregate({ where: { issueId }, _sum: { amountMinor: true } });
  return sum._sum.amountMinor ?? 0;
}

export async function approveRepairAmount(tx: Tx, input: { spaceId: string; issueId: string; amountMinor: number; note: string | null }, actor: RepairActor) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (issue.status !== "FIXED" && issue.status !== "CLOSED") throw new DomainError("Approve the amount once the technician has marked the repair fixed.", "conflict");
  if (!issue.assignedTechnicianId) throw new DomainError("This repair has no technician to pay.", "conflict");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0) throw new DomainError("Enter the amount to pay, or 0.");
  const note = input.note?.trim() ?? "";
  if (input.amountMinor !== (issue.amountAskedMinor ?? input.amountMinor) && !note) throw new DomainError("Say why the approved amount differs from what was asked.");
  const paid = await paidSoFar(tx, issue.id);
  if (input.amountMinor < paid) throw new DomainError("The approved amount can't be less than what is already paid.", "conflict");
  await tx.repairIssue.update({ where: { id: issue.id }, data: { approvedMinor: input.amountMinor, approvedById: actor.userId, approvedAt: new Date(), approvalNote: note.slice(0, 500) || null } });
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: "approved", actor, text: note || null });
  await recordAuditEvent({ client: tx, action: "repair.amount_approved", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairIssue", targetId: issue.id, metadata: { amountMinor: input.amountMinor, askedMinor: issue.amountAskedMinor } });
}

export type PayoutInput = { spaceId: string; issueId: string; amountMinor: number; method: PayoutMethod; reference: string | null; paidAt: Date; note: string | null };

export async function recordRepairPayout(tx: Tx, input: PayoutInput, actor: RepairActor) {
  const issue = await lockIssue(tx, input.spaceId, input.issueId);
  if (issue.status === "CANCELLED") throw new DomainError("This repair was cancelled.", "conflict");
  if (issue.approvedMinor === null || !issue.assignedTechnicianId) throw new DomainError("Approve the amount before paying.", "conflict");
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError("Enter the amount paid.");
  const left = issue.approvedMinor - (await paidSoFar(tx, issue.id));
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { id: true, slug: true, name: true, currency: true } });
  if (input.amountMinor > left) throw new DomainError(left > 0 ? `Only ${formatMoney(left, space.currency)} is left to pay.` : "This repair is paid in full.", "conflict");
  if (needsReference(input.method) && !input.reference?.trim()) throw new DomainError("Add the payment reference (except for cash).");
  if (input.paidAt.getTime() > Date.now() + 5 * 60_000) throw new DomainError("The payment date can't be in the future.");
  const payout = await tx.repairPayout.create({
    data: { spaceId: input.spaceId, issueId: issue.id, technicianId: issue.assignedTechnicianId, amountMinor: input.amountMinor, currency: space.currency, method: input.method, reference: input.reference?.trim().slice(0, 120) || null, paidAt: input.paidAt, paidById: actor.userId, note: input.note?.trim().slice(0, 500) || null },
  });
  await postRepairPayout(tx, payout.id);
  await addTimeline(tx, { spaceId: input.spaceId, issueId: issue.id, kind: "paid", actor });
  await recordAuditEvent({ client: tx, action: "repair.paid", spaceId: input.spaceId, actorId: actor.userId, targetType: "RepairPayout", targetId: payout.id, metadata: { issueId: issue.id, amountMinor: payout.amountMinor, method: payout.method } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "repair.paid", data: { issueId: issue.id, reference: repairRef(issue.number), payoutId: payout.id, technicianId: payout.technicianId, amountMinor: payout.amountMinor, currency: payout.currency } });
  const technician = await tx.technician.findUniqueOrThrow({ where: { id: payout.technicianId } });
  await tellTechnician(tx, space, issue.id, technician, { kind: "repair.paid", title: `${space.name} paid you ${formatMoney(payout.amountMinor, payout.currency)} for ${repairRef(issue.number)}`, body: `Paid by ${payout.method.toLowerCase().replace("_", " ")}${payout.reference ? `, reference ${payout.reference}` : ""}.` });
  return payout;
}
