import "server-only";

import { prisma } from "@/lib/db";
import { OPEN_LOAN_STATUSES, outstanding } from "@/lib/lending/policy";
import { summarizeItems } from "./loansQueue";

/** A member's own loans in one space, open ones first, then the most recent. */
export async function memberLoans(spaceId: string, userId: string) {
  const open = [...OPEN_LOAN_STATUSES];
  const select = {
    id: true, number: true, status: true, dueAt: true, createdAt: true, selfCheckout: true,
    lines: { select: { quantityRequested: true, quantityApproved: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true, item: { select: { name: true } } } },
  } as const;
  const [active, closed] = await Promise.all([
    prisma.loan.findMany({ where: { spaceId, borrowerId: userId, status: { in: open } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select }),
    prisma.loan.findMany({ where: { spaceId, borrowerId: userId, status: { notIn: open } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select }),
  ]);
  const loans = [...active, ...closed];
  return loans.map((loan) => ({
    id: loan.id,
    number: loan.number,
    status: loan.status,
    dueAt: loan.dueAt,
    createdAt: loan.createdAt,
    selfCheckout: loan.selfCheckout,
    items: summarizeItems(loan.lines),
    out: loan.lines.reduce((sum, line) => sum + outstanding(line), 0),
    open: open.includes(loan.status),
  }));
}
