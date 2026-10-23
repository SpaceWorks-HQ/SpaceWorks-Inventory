import type { BorrowingStatus, LoanStatus } from "@prisma/client";
import { canTransition } from "./policy";

export type RenewalFacts = { borrowingStatus: BorrowingStatus | null; openIncidents: number; waitingRequests: number };
export type RenewalRefusal = { reason: string; code: "forbidden" | "conflict" };

/** Pure renewal rules shared by the workflow and both loan views. Staff may override standing. */
export function renewalRefusal(input: RenewalFacts & { status: LoanStatus; maxRenewals: number; renewalCount: number; byBorrower: boolean }): RenewalRefusal | null {
  if (!canTransition(input.status, "renew")) return { reason: "Only an active loan can be renewed.", code: "conflict" };
  if (input.maxRenewals === 0) return { reason: "Renewals are switched off in this space.", code: "forbidden" };
  if (input.renewalCount >= input.maxRenewals) return { reason: `This loan has used its ${input.maxRenewals} ${input.maxRenewals === 1 ? "renewal" : "renewals"}.`, code: "conflict" };
  // An overdue-only restriction does not block renewal of the overdue loan itself.
  const overdueOnly = input.borrowingStatus === "RESTRICTED" && input.openIncidents === 0;
  if (input.byBorrower && input.borrowingStatus !== "GOOD" && !overdueOnly) return { reason: "Your borrowing is restricted; ask staff to renew.", code: "forbidden" };
  if (input.waitingRequests > 0) return { reason: "Someone else is waiting for these items, so the loan can't be renewed.", code: "conflict" };
  return null;
}
