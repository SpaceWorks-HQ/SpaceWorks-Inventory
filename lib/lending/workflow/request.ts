import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { releaseHolds, reserve } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { cancelOpenCharges, createLoanCharges } from "@/lib/payments/charges";
import { checkBorrowingEligibility } from "../access";
import { addDays, loanDaysFor } from "../policy";
import { lockLoan, loanUrl, type Actor } from "./common";

export type RequestLine = { itemId: string; quantity: number };

/**
 * A member asks to borrow. Items must be lendable, active and in the
 * space. Eligibility (standing, limits) is checked now as advice and again
 * at handover. Requests whose items all skip approval are approved at once.
 */
export async function requestLoan(tx: Tx, input: { spaceId: string; borrowerId: string; lines: RequestLine[]; purpose: string | null; neededFrom: Date | null }, actor: Actor) {
  if (input.lines.length === 0) throw new DomainError("Add at least one item to the request.", "invalid");
  if (input.lines.length > 20) throw new DomainError("Request at most 20 different items at once.", "invalid");
  const ids = input.lines.map((line) => line.itemId);
  if (new Set(ids).size !== ids.length) throw new DomainError("List each item once with its quantity.", "invalid");
  if (input.lines.some((line) => !Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)) throw new DomainError("Quantities must be between 1 and 99.", "invalid");
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId } });
  const items = await tx.item.findMany({ where: { id: { in: ids }, spaceId: input.spaceId, archivedAt: null, lendable: true }, select: { id: true, name: true, loanDays: true, requiresApproval: true, category: { select: { loanDays: true } } } });
  if (items.length !== ids.length) throw new DomainError("One of those items can't be borrowed.", "not_found");
  const eligible = await checkBorrowingEligibility(tx, { spaceId: input.spaceId, userId: input.borrowerId, incomingUnits: input.lines.reduce((sum, l) => sum + l.quantity, 0) });
  if (!eligible.ok) throw new DomainError(eligible.error, "forbidden");
  const now = new Date();
  const start = input.neededFrom && input.neededFrom > now ? input.neededFrom : now;
  if (input.neededFrom && input.neededFrom.getTime() > now.getTime() + 90 * 86_400_000) throw new DomainError("Requests can be made up to 90 days ahead.", "invalid");
  const number = await nextSpaceSequence(tx, input.spaceId, "loan");
  const loan = await tx.loan.create({
    data: {
      spaceId: input.spaceId,
      number,
      borrowerId: input.borrowerId,
      purpose: input.purpose,
      neededFrom: input.neededFrom,
      dueAt: addDays(start, loanDaysFor(space, items)),
      lines: { create: input.lines.map((line) => ({ itemId: line.itemId, quantityRequested: line.quantity })) },
    },
  });
  await recordAuditEvent({ client: tx, action: "loan.requested", spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Loan", targetId: loan.id, metadata: { lines: input.lines.length } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.requested", data: { loanId: loan.id, reference: loanRef(number), lines: input.lines.length } });
  const autoApprove = items.every((item) => !item.requiresApproval);
  if (autoApprove) {
    await approveLoan(tx, { spaceId: input.spaceId, loanId: loan.id, quantities: null }, { userId: null });
  } else if (space.notifyStaffOnRequest) {
    await notifyUsers(tx, input.spaceId, await staffIds(tx, input.spaceId), { kind: "loan.requested", title: `New loan request ${loanRef(number)}`, body: `${items.map((i) => i.name).slice(0, 3).join(", ")}${items.length > 3 ? " and more" : ""}`, url: loanUrl(space.slug, loan.id, "staff") }, { excludeUserId: input.borrowerId });
  }
  return loan;
}

/**
 * Approve some or all of a request: holds the stock for each approved unit
 * and raises any deposit and rental charges. `quantities` maps line id to
 * approved units (null approves everything as requested; unlisted lines get 0).
 */
export async function approveLoan(tx: Tx, input: { spaceId: string; loanId: string; quantities: Record<string, number> | null }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "approve");
  let total = 0;
  for (const line of loan.lines) {
    const quantity = input.quantities === null ? line.quantityRequested : input.quantities[line.id] ?? 0;
    if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > line.quantityRequested) throw new DomainError(`Approve between 0 and ${line.quantityRequested} of ${line.item.name}.`, "invalid");
    total += quantity;
    if (quantity === 0) continue;
    await reserve(tx, { spaceId: input.spaceId, itemId: line.itemId, quantity, owner: { loanLineId: line.id } }, actor, { refType: "Loan", refId: loan.id });
    await tx.loanLine.update({ where: { id: line.id }, data: { quantityApproved: quantity } });
  }
  if (total === 0) throw new DomainError("Approve at least one item, or reject the request instead.", "invalid");
  await tx.loan.update({ where: { id: loan.id }, data: { status: "APPROVED", approvedById: actor.userId, approvedAt: new Date() } });
  await createLoanCharges(tx, { loanId: loan.id });
  await recordAuditEvent({ client: tx, action: "loan.approved", spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Loan", targetId: loan.id, metadata: { units: total, automatic: actor.userId === null } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.approved", data: { loanId: loan.id, reference: loanRef(loan.number), units: total } });
  await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.approved", title: `${loanRef(loan.number)} is ready to collect`, body: "Bring it to the desk; staff will scan and photograph the items as they hand them over.", url: loanUrl(loan.space.slug, loan.id, "borrower"), email: true });
}

export async function rejectLoan(tx: Tx, input: { spaceId: string; loanId: string; reason: string }, actor: Actor) {
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Give the member a short reason.", "invalid");
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "reject");
  await tx.loan.update({ where: { id: loan.id }, data: { status: "REJECTED", rejectedById: actor.userId, rejectedAt: new Date(), rejectReason: reason.slice(0, 500) } });
  await recordAuditEvent({ client: tx, action: "loan.rejected", spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Loan", targetId: loan.id });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.rejected", data: { loanId: loan.id, reference: loanRef(loan.number) } });
  await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.rejected", title: `${loanRef(loan.number)} wasn't approved`, body: reason, url: loanUrl(loan.space.slug, loan.id, "borrower"), email: true });
}

/**
 * The borrower (own request) or staff withdraw a request before handover;
 * holds and unpaid charges go, and paid deposits or rental are queued for refund.
 */
export async function cancelLoan(tx: Tx, input: { spaceId: string; loanId: string; reason: string | null; byBorrowerId?: string }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "cancel", input.byBorrowerId);
  for (const line of loan.lines) {
    await releaseHolds(tx, { spaceId: input.spaceId, itemId: line.itemId, owner: { loanLineId: line.id } }, actor, { refType: "Loan", refId: loan.id });
  }
  await tx.loan.update({ where: { id: loan.id }, data: { status: "CANCELLED", cancelledAt: new Date(), staffNote: input.reason?.slice(0, 500) ?? loan.staffNote } });
  const { refundIds } = await cancelOpenCharges(tx, { loanId: loan.id, reason: input.reason ?? "Loan cancelled", actorId: actor.userId });
  await recordAuditEvent({ client: tx, action: "loan.cancelled", spaceId: input.spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Loan", targetId: loan.id, metadata: { byBorrower: Boolean(input.byBorrowerId) } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.cancelled", data: { loanId: loan.id, reference: loanRef(loan.number) } });
  if (!input.byBorrowerId) {
    await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.cancelled", title: `${loanRef(loan.number)} was cancelled`, body: input.reason, url: loanUrl(loan.space.slug, loan.id, "borrower"), email: true });
  }
  // Callers pass these to processQueuedRefunds after the transaction commits.
  return { refundIds };
}
