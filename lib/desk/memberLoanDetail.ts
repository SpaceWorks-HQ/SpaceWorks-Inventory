import "server-only";

import { loanDetail } from "./loansDetail";
import { memberLoanView } from "./memberLoanView";
import { prisma } from "@/lib/db";
import { renewalFacts } from "@/lib/lending/renewalReadiness";

export async function memberLoanDetail(spaceId: string, loanId: string, borrowerId: string, policy: Parameters<typeof memberLoanView>[1]) {
  const loan = await loanDetail(spaceId, loanId, { borrowerId });
  if (!loan) return null;
  const facts = await renewalFacts(prisma, spaceId, borrowerId, loan.lines.filter((line) => line.outstanding > 0).map((line) => line.itemId));
  return memberLoanView(loan, policy, new Date(), facts);
}
