import "server-only";

import { prisma } from "@/lib/db";
import { loanRef } from "@/lib/catalogue/references";
import { availabilityFor } from "@/lib/inventory/availability";
import { ACTIVE_LOAN_STATUSES, outstanding } from "@/lib/lending/policy";
import type { DateRange } from "./range";
import type { ReportTable } from "./table";

const DAY_MS = 86_400_000;

export type OverdueLoanRow = { loanId: string; reference: string; number: number; borrowerId: string; borrowerName: string | null; dueAt: Date; daysOverdue: number; units: number };

/** Whole days past due, at least one for anything overdue. */
export function daysOverdue(dueAt: Date, now: Date) {
  return Math.max(1, Math.floor((now.getTime() - dueAt.getTime()) / DAY_MS));
}

/** Issued or partly returned loans past their due date, most overdue first. */
export async function overdueLoansReport(spaceId: string, now: Date = new Date()): Promise<OverdueLoanRow[]> {
  const loans = await prisma.loan.findMany({
    where: { spaceId, status: { in: [...ACTIVE_LOAN_STATUSES] }, dueAt: { lt: now } },
    orderBy: { dueAt: "asc" },
    take: 1000,
    select: { id: true, number: true, borrowerId: true, dueAt: true, borrower: { select: { name: true } }, lines: { select: { quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true } } },
  });
  return loans.map((loan) => ({
    loanId: loan.id,
    reference: loanRef(loan.number),
    number: loan.number,
    borrowerId: loan.borrowerId,
    borrowerName: loan.borrower.name,
    dueAt: loan.dueAt,
    daysOverdue: daysOverdue(loan.dueAt, now),
    units: loan.lines.reduce((sum, line) => sum + Math.max(0, outstanding(line)), 0),
  }));
}

export type LoansReport = {
  activeLoans: number;
  unitsOut: number;
  issuedInRange: number;
  /** Units out on loan as a share of every lendable, returnable unit the space holds (0–1). */
  utilisation: number;
  overdue: OverdueLoanRow[];
  byMember: { borrowerId: string; name: string | null; activeLoans: number; unitsOut: number; overdueLoans: number; loansInRange: number }[];
  mostBorrowed: { itemId: string; sku: string; name: string; loans: number; units: number }[];
};

export async function loansReport(spaceId: string, range: DateRange, now: Date = new Date()): Promise<LoansReport> {
  const [active, issued, overdue, lendable] = await Promise.all([
    prisma.loan.findMany({
      where: { spaceId, status: { in: [...ACTIVE_LOAN_STATUSES] } },
      select: { borrowerId: true, dueAt: true, borrower: { select: { name: true } }, lines: { select: { quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true } } },
    }),
    prisma.loan.findMany({
      where: { spaceId, issuedAt: { gte: range.from, lt: range.to } },
      select: { borrowerId: true, borrower: { select: { name: true } }, lines: { select: { itemId: true, quantityIssued: true, item: { select: { sku: true, name: true } } } } },
    }),
    overdueLoansReport(spaceId, now),
    prisma.item.findMany({ where: { spaceId, lendable: true, consumable: false, archivedAt: null }, select: { id: true } }),
  ]);
  const members = new Map<string, LoansReport["byMember"][number]>();
  const member = (id: string, name: string | null) => {
    let row = members.get(id);
    if (!row) members.set(id, (row = { borrowerId: id, name, activeLoans: 0, unitsOut: 0, overdueLoans: 0, loansInRange: 0 }));
    return row;
  };
  let unitsOut = 0;
  for (const loan of active) {
    const units = loan.lines.reduce((sum, line) => sum + Math.max(0, outstanding(line)), 0);
    unitsOut += units;
    const row = member(loan.borrowerId, loan.borrower.name);
    row.activeLoans += 1;
    row.unitsOut += units;
    if (loan.dueAt < now) row.overdueLoans += 1;
  }
  const items = new Map<string, LoansReport["mostBorrowed"][number]>();
  for (const loan of issued) {
    member(loan.borrowerId, loan.borrower.name).loansInRange += 1;
    for (const line of loan.lines) {
      if (line.quantityIssued <= 0) continue;
      const row = items.get(line.itemId) ?? { itemId: line.itemId, sku: line.item.sku, name: line.item.name, loans: 0, units: 0 };
      row.loans += 1;
      row.units += line.quantityIssued;
      items.set(line.itemId, row);
    }
  }
  const totals = await availabilityFor(spaceId, lendable.map((item) => item.id));
  let held = 0;
  let out = 0;
  for (const value of totals.values()) {
    held += value.onHand + value.onLoan;
    out += value.onLoan;
  }
  return {
    activeLoans: active.length,
    unitsOut,
    issuedInRange: issued.length,
    utilisation: held > 0 ? out / held : 0,
    overdue,
    byMember: [...members.values()].sort((a, b) => b.unitsOut - a.unitsOut || b.loansInRange - a.loansInRange).slice(0, 200),
    mostBorrowed: [...items.values()].sort((a, b) => b.loans - a.loans || b.units - a.units).slice(0, 50),
  };
}

export function loansTables(report: LoansReport, timeZoneDate: (date: Date) => string): ReportTable[] {
  return [
    {
      title: "Overdue loans",
      columns: [{ key: "reference", label: "Loan" }, { key: "borrower", label: "Member" }, { key: "due", label: "Due" }, { key: "days", label: "Days overdue", kind: "number" }, { key: "units", label: "Units out", kind: "number" }],
      rows: report.overdue.map((row) => ({ reference: row.reference, borrower: row.borrowerName ?? "Member", due: timeZoneDate(row.dueAt), days: row.daysOverdue, units: row.units })),
    },
    {
      title: "Loans by member",
      columns: [{ key: "name", label: "Member" }, { key: "active", label: "Active loans", kind: "number" }, { key: "units", label: "Units out", kind: "number" }, { key: "overdue", label: "Overdue loans", kind: "number" }, { key: "inRange", label: "Loans in period", kind: "number" }],
      rows: report.byMember.map((row) => ({ name: row.name ?? "Member", active: row.activeLoans, units: row.unitsOut, overdue: row.overdueLoans, inRange: row.loansInRange })),
    },
    {
      title: "Most borrowed items",
      columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "loans", label: "Loans", kind: "number" }, { key: "units", label: "Units", kind: "number" }],
      rows: report.mostBorrowed.map((row) => ({ sku: row.sku, name: row.name, loans: row.loans, units: row.units })),
    },
  ];
}
