import type { LoanStatus } from "@prisma/client";

/**
 * Pure loan rules (client-safe, unit tested): loan length, due dates and the
 * state machine. lib/lending/workflow is the only code that applies them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type DaysSource = { loanDays: number | null; category: { loanDays: number | null } | null };

/** A loan lasts the shortest of its items' loan lengths (item → category → space default), within the space maximum. */
export function loanDaysFor(space: { defaultLoanDays: number; maxLoanDays: number }, items: DaysSource[]): number {
  const days = items.map((item) => item.loanDays ?? item.category?.loanDays ?? space.defaultLoanDays);
  const shortest = days.length ? Math.min(...days) : space.defaultLoanDays;
  return Math.max(1, Math.min(shortest, space.maxLoanDays));
}

export function addDays(start: Date, days: number): Date {
  return new Date(start.getTime() + days * DAY_MS);
}

/** Whole days late after the grace period (0 when on time). */
export function daysLate(dueAt: Date, returnedAt: Date, graceDays = 0): number {
  const late = Math.ceil((returnedAt.getTime() - dueAt.getTime()) / DAY_MS);
  return Math.max(0, late - graceDays);
}

export function isOverdue(loan: { status: LoanStatus; dueAt: Date }, now = new Date()): boolean {
  return (loan.status === "ISSUED" || loan.status === "PARTIALLY_RETURNED") && loan.dueAt < now;
}

export type LoanAction = "approve" | "reject" | "cancel" | "issue" | "return" | "renew" | "setDue";

const FROM: Record<LoanAction, readonly LoanStatus[]> = {
  approve: ["REQUESTED"],
  reject: ["REQUESTED"],
  cancel: ["REQUESTED", "APPROVED"],
  issue: ["APPROVED"],
  return: ["ISSUED", "PARTIALLY_RETURNED"],
  renew: ["ISSUED", "PARTIALLY_RETURNED"],
  setDue: ["APPROVED", "ISSUED", "PARTIALLY_RETURNED"],
};

export function canTransition(status: LoanStatus, action: LoanAction): boolean {
  return FROM[action].includes(status);
}

export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Ready to collect",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  ISSUED: "On loan",
  PARTIALLY_RETURNED: "Partly returned",
  RETURNED: "Returned",
  CLOSED_WITH_ISSUE: "Closed with an issue",
};

export const OPEN_LOAN_STATUSES: readonly LoanStatus[] = ["REQUESTED", "APPROVED", "ISSUED", "PARTIALLY_RETURNED"];
export const ACTIVE_LOAN_STATUSES: readonly LoanStatus[] = ["ISSUED", "PARTIALLY_RETURNED"];

/** Units of a line still out with the borrower. */
export function outstanding(line: { quantityIssued: number; quantityReturned: number; quantityDamaged: number; quantityLost: number; quantityConsumed: number }) {
  return line.quantityIssued - line.quantityReturned - line.quantityDamaged - line.quantityLost - line.quantityConsumed;
}
