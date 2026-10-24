import "server-only";

import { repairRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { dayInZone, type DateRange } from "./range";
import type { ReportTable } from "./table";

/**
 * Repair spend: payouts made in the period by repair, technician, item and
 * month, plus what is approved but not yet paid. Money reports are for
 * inventory managers only (the reports page and export check that).
 */
export async function repairsReport(spaceId: string, range: DateRange, timeZone: string) {
  const [payouts, opened, closed, owed] = await Promise.all([
    prisma.repairPayout.findMany({
      where: { spaceId, paidAt: { gte: range.from, lt: range.to } },
      select: { amountMinor: true, paidAt: true, technician: { select: { id: true, name: true } }, issue: { select: { id: true, number: true, title: true, item: { select: { id: true, name: true, sku: true } } } } },
    }),
    prisma.repairIssue.count({ where: { spaceId, createdAt: { gte: range.from, lt: range.to } } }),
    prisma.repairIssue.count({ where: { spaceId, status: "CLOSED", closedAt: { gte: range.from, lt: range.to } } }),
    prisma.repairIssue.findMany({ where: { spaceId, approvedMinor: { gt: 0 }, status: { not: "CANCELLED" } }, select: { approvedMinor: true, payouts: { select: { amountMinor: true } } } }),
  ]);
  const sum = <K extends string>(key: (row: (typeof payouts)[number]) => K, label: (row: (typeof payouts)[number]) => string) => {
    const map = new Map<K, { label: string; payouts: number; amountMinor: number }>();
    for (const row of payouts) {
      const entry = map.get(key(row)) ?? { label: label(row), payouts: 0, amountMinor: 0 };
      entry.payouts += 1;
      entry.amountMinor += row.amountMinor;
      map.set(key(row), entry);
    }
    return [...map.entries()].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.amountMinor - a.amountMinor);
  };
  return {
    opened,
    closed,
    paidMinor: payouts.reduce((total, row) => total + row.amountMinor, 0),
    unpaidMinor: owed.reduce((total, issue) => total + Math.max(0, (issue.approvedMinor ?? 0) - issue.payouts.reduce((paid, payout) => paid + payout.amountMinor, 0)), 0),
    byRepair: sum((row) => row.issue.id, (row) => `${repairRef(row.issue.number)} ${row.issue.title}`),
    byTechnician: sum((row) => row.technician.id, (row) => row.technician.name),
    byItem: sum((row) => row.issue.item.id, (row) => `${row.issue.item.name} (${row.issue.item.sku})`),
    byMonth: sum((row) => dayInZone(row.paidAt, timeZone).slice(0, 7), (row) => dayInZone(row.paidAt, timeZone).slice(0, 7)).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

export type RepairsReport = Awaited<ReturnType<typeof repairsReport>>;

export function repairsTables(report: RepairsReport): ReportTable[] {
  const grouped = (title: string, label: string, rows: RepairsReport["byRepair"]): ReportTable => ({
    title,
    columns: [{ key: "label", label }, { key: "payouts", label: "Payouts", kind: "number" }, { key: "amount", label: "Paid", kind: "money" }],
    rows: rows.map((row) => ({ label: row.label, payouts: row.payouts, amount: row.amountMinor })),
  });
  return [
    {
      title: "Repairs summary",
      columns: [{ key: "label", label: "Measure" }, { key: "value", label: "Value", kind: "number" }, { key: "amount", label: "Amount", kind: "money" }],
      rows: [
        { label: "Reported in period", value: report.opened, amount: null },
        { label: "Closed in period", value: report.closed, amount: null },
        { label: "Paid in period", value: null, amount: report.paidMinor },
        { label: "Approved, not paid yet", value: null, amount: report.unpaidMinor },
      ],
    },
    grouped("Repair spend by repair", "Repair", report.byRepair),
    grouped("Repair spend by technician", "Technician", report.byTechnician),
    grouped("Repair spend by item", "Item", report.byItem),
    grouped("Repair spend by month", "Month", report.byMonth),
  ];
}
