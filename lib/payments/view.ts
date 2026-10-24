import "server-only";

import { prisma } from "@/lib/db";
import { loanPaymentSummary } from "./summary";
import type { LoanPaymentSummary } from "./types";

/**
 * The payment panel's data for a loan of this space, or null when the loan
 * isn't in it. The page still checks the viewer may see the loan (staff, or
 * the borrower themselves) before rendering.
 */
export async function getLoanPaymentView(spaceId: string, loanId: string): Promise<LoanPaymentSummary | null> {
  const loan = await prisma.loan.findFirst({ where: { id: loanId, spaceId }, select: { id: true } });
  if (!loan) return null;
  return loanPaymentSummary(prisma, loan.id);
}
