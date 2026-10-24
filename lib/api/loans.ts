import "server-only";

import type { Tx } from "@/lib/db";
import { notFound } from "@/lib/domainError";
import { approveLoan, cancelLoan, rejectLoan, requestLoan } from "@/lib/lending/workflow";
import type { LoanApiAction } from "./schemas";

/**
 * Loan requests through the API. Issue and return need QR scans and photo
 * evidence at the desk, so the API stops at request, approve, reject and
 * cancel. Members are addressed by their membership id in this space.
 */
type Actor = { userId: string; apiTokenId: string };

export async function apiRequestLoan(tx: Tx, spaceId: string, input: { memberId: string; lines: { itemId: string; quantity: number }[]; purpose: string | null; neededFrom: Date | null }, actor: Actor) {
  const membership = await tx.membership.findFirst({ where: { id: input.memberId, spaceId, status: "ACTIVE" }, select: { userId: true } });
  if (!membership) notFound("member");
  return requestLoan(tx, { spaceId, borrowerId: membership.userId, lines: input.lines, purpose: input.purpose, neededFrom: input.neededFrom }, actor);
}

export async function apiLoanAction(tx: Tx, spaceId: string, loanId: string, action: LoanApiAction, body: { quantities?: Record<string, number> | null; reason?: string | null }, actor: Actor) {
  if (action === "approve") return approveLoan(tx, { spaceId, loanId, quantities: body.quantities ?? null }, actor);
  if (action === "reject") return rejectLoan(tx, { spaceId, loanId, reason: body.reason ?? "" }, actor);
  return cancelLoan(tx, { spaceId, loanId, reason: body.reason ?? null }, actor);
}
