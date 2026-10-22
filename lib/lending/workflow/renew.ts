import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { formatDayLong } from "@/lib/format/datetime";
import { notifyUsers } from "@/lib/notify";
import { addRenewalCharge } from "@/lib/payments/charges";
import { syncAutomaticRestriction } from "../access";
import { addDays, outstanding } from "../policy";
import { lockLoan, loanUrl, type Actor } from "./common";

/**
 * Extend an active loan by the space's renewal period. Members renew their
 * own loans while in good standing, up to the renewal limit, and only when
 * nobody else is waiting for the same items.
 */
export async function renewLoan(tx: Tx, input: { spaceId: string; loanId: string; byBorrowerId?: string }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "renew");
  if (input.byBorrowerId && loan.borrowerId !== input.byBorrowerId) throw new DomainError("That loan wasn't found.", "not_found");
  const space = loan.space;
  if (space.maxRenewals === 0) throw new DomainError("Renewals are switched off in this space.", "forbidden");
  if (loan.renewalCount >= space.maxRenewals) throw new DomainError(`This loan has used its ${space.maxRenewals} ${space.maxRenewals === 1 ? "renewal" : "renewals"}.`, "conflict");
  if (input.byBorrowerId) {
    const membership = await tx.membership.findUnique({ where: { userId_spaceId: { userId: loan.borrowerId, spaceId: input.spaceId } }, select: { borrowingStatus: true } });
    // An overdue-only restriction does not block a renewal of the overdue loan itself.
    const overdueOnly = membership?.borrowingStatus === "RESTRICTED" && !(await tx.loanIncident.count({ where: { spaceId: input.spaceId, borrowerId: loan.borrowerId, status: "OPEN" } }));
    if (membership?.borrowingStatus !== "GOOD" && !overdueOnly) throw new DomainError("Your borrowing is restricted; ask staff to renew.", "forbidden");
  }
  const outstandingItems = loan.lines.filter((line) => outstanding(line) > 0).map((line) => line.itemId);
  const waiting = await tx.loanLine.count({
    where: { itemId: { in: outstandingItems }, loan: { spaceId: input.spaceId, status: { in: ["REQUESTED", "APPROVED"] }, NOT: { borrowerId: loan.borrowerId } } },
  });
  if (waiting > 0) throw new DomainError("Someone else is waiting for these items, so the loan can't be renewed.", "conflict");
  const base = loan.dueAt > new Date() ? loan.dueAt : new Date();
  const dueAt = addDays(base, space.renewalDays);
  await tx.loan.update({ where: { id: loan.id }, data: { dueAt, renewalCount: { increment: 1 }, dueReminderAt: null, overdueAt: null, escalatedAt: null } });
  await addRenewalCharge(tx, { loanId: loan.id, extraDays: space.renewalDays });
  await syncAutomaticRestriction(tx, { spaceId: input.spaceId, userId: loan.borrowerId });
  await recordAuditEvent({ client: tx, action: "loan.renewed", spaceId: input.spaceId, actorId: actor.userId, targetType: "Loan", targetId: loan.id, metadata: { renewalCount: loan.renewalCount + 1, byBorrower: Boolean(input.byBorrowerId) } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.renewed", data: { loanId: loan.id, reference: loanRef(loan.number), dueAt: dueAt.toISOString() } });
  if (!input.byBorrowerId) {
    await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.renewed", title: `${loanRef(loan.number)} is now due ${formatDayLong(dueAt, space.timezone)}`, url: loanUrl(space.slug, loan.id, "borrower"), email: true });
  }
  return { dueAt };
}

/** Staff set a different due date (not in the past, within the longest loan from now). */
export async function setDueDate(tx: Tx, input: { spaceId: string; loanId: string; dueAt: Date }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "setDue");
  const now = new Date();
  if (input.dueAt.getTime() < now.getTime() + 60 * 60_000) throw new DomainError("Pick a due date at least an hour from now.", "invalid");
  if (input.dueAt > addDays(now, Math.max(loan.space.maxLoanDays, 1) * 2)) throw new DomainError("That due date is too far away.", "invalid");
  await tx.loan.update({ where: { id: loan.id }, data: { dueAt: input.dueAt, dueReminderAt: null, overdueAt: null, escalatedAt: null } });
  await syncAutomaticRestriction(tx, { spaceId: input.spaceId, userId: loan.borrowerId, now });
  await recordAuditEvent({ client: tx, action: "loan.due_changed", spaceId: input.spaceId, actorId: actor.userId, targetType: "Loan", targetId: loan.id, metadata: { from: loan.dueAt.toISOString(), to: input.dueAt.toISOString() } });
  await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.due_changed", title: `${loanRef(loan.number)} is now due ${formatDayLong(input.dueAt, loan.space.timezone)}`, url: loanUrl(loan.space.slug, loan.id, "borrower"), email: true });
}
