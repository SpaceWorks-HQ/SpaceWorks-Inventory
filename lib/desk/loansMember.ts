import "server-only";

import { prisma } from "@/lib/db";
import { outstanding } from "@/lib/lending/policy";
import { summarizeItems } from "./loansQueue";

/** A member's own loans in one space, open ones first, then the most recent. */
export async function memberLoans(spaceId: string, userId: string) {
  const loans = await prisma.loan.findMany({
    where: { spaceId, borrowerId: userId },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    select: {
      id: true, number: true, status: true, dueAt: true, createdAt: true, selfCheckout: true,
      lines: { select: { quantityRequested: true, quantityApproved: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true, item: { select: { name: true } } } },
    },
  });
  const open = new Set(["REQUESTED", "APPROVED", "ISSUED", "PARTIALLY_RETURNED"]);
  return loans
    .map((loan) => ({
      id: loan.id,
      number: loan.number,
      status: loan.status,
      dueAt: loan.dueAt,
      createdAt: loan.createdAt,
      selfCheckout: loan.selfCheckout,
      items: summarizeItems(loan.lines),
      out: loan.lines.reduce((sum, line) => sum + outstanding(line), 0),
      open: open.has(loan.status),
    }))
    .sort((a, b) => Number(b.open) - Number(a.open));
}
