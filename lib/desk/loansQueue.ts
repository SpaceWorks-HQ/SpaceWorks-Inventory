import "server-only";

import type { LoanStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseRef } from "@/lib/catalogue/references";
import { outstanding } from "@/lib/lending/policy";

export const LOAN_TABS = ["requests", "ready", "on-loan", "overdue", "closed"] as const;
export type LoanTab = (typeof LOAN_TABS)[number];

export const LOAN_TAB_LABEL: Record<LoanTab, string> = { requests: "Requests", ready: "Ready to collect", "on-loan": "On loan", overdue: "Overdue", closed: "Closed" };

const ACTIVE: LoanStatus[] = ["ISSUED", "PARTIALLY_RETURNED"];
const CLOSED: LoanStatus[] = ["REJECTED", "CANCELLED", "RETURNED", "CLOSED_WITH_ISSUE"];

export function loanTab(value: unknown): LoanTab {
  return LOAN_TABS.find((tab) => tab === value) ?? "requests";
}

function tabWhere(tab: LoanTab, now: Date): Prisma.LoanWhereInput {
  switch (tab) {
    case "requests": return { status: "REQUESTED" };
    case "ready": return { status: "APPROVED" };
    case "on-loan": return { status: { in: ACTIVE }, dueAt: { gte: now } };
    case "overdue": return { status: { in: ACTIVE }, dueAt: { lt: now } };
    case "closed": return { status: { in: CLOSED } };
  }
}

const ORDER: Record<LoanTab, Prisma.LoanOrderByWithRelationInput[]> = {
  requests: [{ createdAt: "asc" }],
  ready: [{ approvedAt: "asc" }],
  "on-loan": [{ dueAt: "asc" }],
  overdue: [{ dueAt: "asc" }],
  closed: [{ updatedAt: "desc" }],
};

/** Member name/email or an LN reference ("LN-0042", "42"). */
export function searchWhere(query: string): Prisma.LoanWhereInput | null {
  const q = query.trim().slice(0, 100);
  if (!q) return null;
  const number = parseRef(q, "LN");
  const person: Prisma.LoanWhereInput = { borrower: { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } };
  return number !== null ? { OR: [{ number }, person] } : person;
}

/** The desk queue of one space: one tab, an optional search, and counts for every tab. */
export async function loanQueue(spaceId: string, tab: LoanTab, query: string, now: Date = new Date()) {
  const search = searchWhere(query);
  const base: Prisma.LoanWhereInput = { spaceId, ...(search ?? {}) };
  const [rows, counts] = await Promise.all([
    prisma.loan.findMany({
      where: { ...base, ...tabWhere(tab, now) },
      orderBy: ORDER[tab],
      take: 100,
      select: {
        id: true, number: true, status: true, dueAt: true, createdAt: true, neededFrom: true, selfCheckout: true,
        borrower: { select: { name: true, email: true } },
        lines: { select: { quantityRequested: true, quantityApproved: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true, item: { select: { name: true } } } },
      },
    }),
    Promise.all(LOAN_TABS.map((t) => prisma.loan.count({ where: { ...base, ...tabWhere(t, now) } }))),
  ]);
  return {
    rows: rows.map((loan) => ({
      id: loan.id,
      number: loan.number,
      status: loan.status,
      dueAt: loan.dueAt,
      createdAt: loan.createdAt,
      neededFrom: loan.neededFrom,
      selfCheckout: loan.selfCheckout,
      borrowerName: loan.borrower.name?.trim() || loan.borrower.email,
      borrowerEmail: loan.borrower.email,
      items: summarizeItems(loan.lines),
      units: ACTIVE.includes(loan.status) ? loan.lines.reduce((sum, line) => sum + outstanding(line), 0) : loan.lines.reduce((sum, line) => sum + (line.quantityApproved || line.quantityRequested), 0),
    })),
    counts: Object.fromEntries(LOAN_TABS.map((t, i) => [t, counts[i]!])) as Record<LoanTab, number>,
  };
}

/** "Drill, Soldering iron and 2 more" */
export function summarizeItems(lines: ReadonlyArray<{ item: { name: string } }>): string {
  const names = [...new Set(lines.map((line) => line.item.name))];
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
}
