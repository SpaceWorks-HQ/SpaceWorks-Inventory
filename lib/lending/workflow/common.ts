import "server-only";

import type { LoanStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { loanRef } from "@/lib/catalogue/references";
import { canTransition, LOAN_STATUS_LABEL, type LoanAction } from "../policy";

export type Actor = { userId: string | null; apiTokenId?: string | null };

/**
 * Lock the loan row first (lock order: loan → Item → StockLevel → Asset),
 * then re-read it, so concurrent desk actions serialise and each re-checks
 * the status it acts on.
 */
export async function lockLoan(tx: Tx, spaceId: string, loanId: string, action: LoanAction) {
  const [row] = await tx.$queryRaw<{ id: string; status: LoanStatus }[]>`
    SELECT "id", "status"::text AS "status" FROM "Loan" WHERE "id" = ${loanId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That loan wasn't found.", "not_found");
  const loan = await tx.loan.findUniqueOrThrow({
    where: { id: loanId },
    include: {
      lines: { include: { item: { select: { id: true, name: true, sku: true, tracking: true, consumable: true, qrCode: true } }, asset: { select: { id: true, qrCode: true, assetTag: true } } }, orderBy: { id: "asc" } },
      space: true,
      borrower: { select: { id: true, name: true, email: true } },
    },
  });
  if (!canTransition(loan.status, action)) {
    throw new DomainError(`${loanRef(loan.number)} is ${LOAN_STATUS_LABEL[loan.status].toLowerCase()}, so it can't be ${PAST[action]} now.`, "conflict");
  }
  return loan;
}

const PAST: Record<LoanAction, string> = {
  approve: "approved", reject: "rejected", cancel: "cancelled", issue: "issued", return: "returned", renew: "renewed", setDue: "given a new due date",
};

export type LockedLoan = Awaited<ReturnType<typeof lockLoan>>;

export function loanUrl(slug: string, loanId: string, viewer: "staff" | "borrower") {
  return viewer === "staff" ? `/s/${slug}/loans/${loanId}` : `/s/${slug}/my-loans/${loanId}`;
}
