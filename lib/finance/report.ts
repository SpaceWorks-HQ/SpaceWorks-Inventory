import "server-only";

import type { FinanceCategory, FinanceDirection, FinanceMethod } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";
import { dayInZone, type DateRange } from "@/lib/reports/range";
import type { ReportTable } from "@/lib/reports/table";
import { CATEGORY_LABEL, METHOD_LABEL, SOURCE_LABEL } from "./labels";
import { periodKey, periodLabel, type PeriodGroup } from "./periods";

/**
 * Income, expenses and net from the finance ledger: per period, category,
 * method, item, technician and supplier, plus the entries themselves with a
 * link back to their source. Reversals count against their category.
 */

type Totals = { inMinor: number; outMinor: number };
type Row<K extends string> = Totals & { key: K; label: string };

const MAX_ENTRIES = 20_000;

function add(map: Map<string, Totals & { label: string }>, key: string, label: string, direction: FinanceDirection, amount: number) {
  const row = map.get(key) ?? { label, inMinor: 0, outMinor: 0 };
  if (direction === "IN") row.inMinor += amount;
  else row.outMinor += amount;
  map.set(key, row);
}

function rows<K extends string>(map: Map<string, Totals & { label: string }>) {
  return [...map.entries()].map(([key, row]) => ({ key: key as K, ...row })) as Row<K>[];
}

export async function financeReport(space: { id: string; slug: string; timezone: string }, range: DateRange, group: PeriodGroup) {
  const entries = await prisma.financeEntry.findMany({ where: { spaceId: space.id, occurredAt: { gte: range.from, lt: range.to } }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: MAX_ENTRIES });
  const periods = new Map<string, Totals & { label: string }>();
  const categories = new Map<string, Totals & { label: string }>();
  const methods = new Map<string, Totals & { label: string }>();
  const items = new Map<string, Totals & { label: string }>();
  const technicians = new Map<string, Totals & { label: string }>();
  const suppliers = new Map<string, Totals & { label: string }>();
  const ids = { item: new Set<string>(), technician: new Set<string>(), supplier: new Set<string>() };
  for (const entry of entries) {
    if (entry.itemId) ids.item.add(entry.itemId);
    if (entry.technicianId) ids.technician.add(entry.technicianId);
    if (entry.supplierId) ids.supplier.add(entry.supplierId);
  }
  const [itemRows, technicianRows, supplierRows] = await Promise.all([
    prisma.item.findMany({ where: { id: { in: [...ids.item] }, spaceId: space.id }, select: { id: true, name: true, sku: true } }),
    prisma.technician.findMany({ where: { id: { in: [...ids.technician] }, spaceId: space.id }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { id: { in: [...ids.supplier] }, spaceId: space.id }, select: { id: true, name: true } }),
  ]);
  const itemName = new Map(itemRows.map((row) => [row.id, `${row.name} (${row.sku})`]));
  const technicianName = new Map(technicianRows.map((row) => [row.id, row.name]));
  const supplierName = new Map(supplierRows.map((row) => [row.id, row.name]));
  let inMinor = 0;
  let outMinor = 0;
  for (const entry of entries) {
    const amount = entry.amountMinor;
    if (entry.direction === "IN") inMinor += amount;
    else outMinor += amount;
    const key = periodKey(dayInZone(entry.occurredAt, space.timezone), group);
    add(periods, key, periodLabel(key, group), entry.direction, amount);
    add(categories, entry.category, CATEGORY_LABEL[entry.category], entry.direction, amount);
    add(methods, entry.method, METHOD_LABEL[entry.method], entry.direction, amount);
    if (entry.itemId) add(items, entry.itemId, itemName.get(entry.itemId) ?? "Deleted item", entry.direction, amount);
    if (entry.technicianId) add(technicians, entry.technicianId, technicianName.get(entry.technicianId) ?? "Technician", entry.direction, amount);
    if (entry.supplierId) add(suppliers, entry.supplierId, supplierName.get(entry.supplierId) ?? "Supplier", entry.direction, amount);
  }
  const reversed = new Set(entries.map((entry) => entry.reversesId).filter(Boolean));
  const shown = entries.slice(0, 500);
  const links = await sourceLinks(space, shown);
  return {
    truncated: entries.length === MAX_ENTRIES,
    totals: { inMinor, outMinor, netMinor: inMinor - outMinor },
    byPeriod: rows<string>(periods).sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: rows<FinanceCategory>(categories).sort((a, b) => b.inMinor + b.outMinor - (a.inMinor + a.outMinor)),
    byMethod: rows<FinanceMethod>(methods).sort((a, b) => b.inMinor + b.outMinor - (a.inMinor + a.outMinor)),
    byItem: rows<string>(items).sort((a, b) => b.outMinor - a.outMinor || b.inMinor - a.inMinor).slice(0, 100),
    byTechnician: rows<string>(technicians).sort((a, b) => b.outMinor - a.outMinor),
    bySupplier: rows<string>(suppliers).sort((a, b) => b.outMinor - a.outMinor),
    entries: shown.map((entry) => ({
      id: entry.id,
      day: formatDate(entry.occurredAt, space.timezone),
      direction: entry.direction,
      category: entry.category,
      method: entry.method,
      amountMinor: entry.amountMinor,
      reference: entry.reference,
      note: entry.note,
      source: SOURCE_LABEL[entry.sourceType] ?? entry.sourceType,
      href: links.get(entry.id) ?? null,
      reversal: Boolean(entry.reversesId),
      reversed: reversed.has(entry.id),
    })),
  };
}

export type FinanceReport = Awaited<ReturnType<typeof financeReport>>;

/** Drill-down links: the loan behind a payment or refund, the repair behind a payout, the buy list for purchases. */
async function sourceLinks(space: { id: string; slug: string }, entries: { id: string; sourceType: string; sourceId: string }[]) {
  const of = (type: string) => entries.filter((entry) => entry.sourceType === type).map((entry) => entry.sourceId);
  const [payments, refunds, payouts] = await Promise.all([
    prisma.payment.findMany({ where: { id: { in: of("Payment") }, spaceId: space.id }, select: { id: true, loanId: true } }),
    prisma.refund.findMany({ where: { id: { in: of("Refund") }, spaceId: space.id }, select: { id: true, payment: { select: { loanId: true } } } }),
    prisma.repairPayout.findMany({ where: { id: { in: of("RepairPayout") }, spaceId: space.id }, select: { id: true, issueId: true } }),
  ]);
  const base = `/s/${space.slug}`;
  const loanOf = new Map([...payments.map((row) => [row.id, row.loanId] as const), ...refunds.map((row) => [row.id, row.payment.loanId] as const)]);
  const issueOf = new Map(payouts.map((row) => [row.id, row.issueId]));
  const links = new Map<string, string>();
  for (const entry of entries) {
    if (loanOf.has(entry.sourceId)) links.set(entry.id, `${base}/loans/${loanOf.get(entry.sourceId)}`);
    else if (issueOf.has(entry.sourceId)) links.set(entry.id, `${base}/repairs/${issueOf.get(entry.sourceId)}`);
    else if (entry.sourceType === "PurchaseItem") links.set(entry.id, `${base}/purchases?status=received`);
  }
  return links;
}

const money = (key: string, label: string) => ({ key, label, kind: "money" as const });

export function financeTables(report: FinanceReport): ReportTable[] {
  const grouped = (title: string, label: string, list: Row<string>[]): ReportTable => ({
    title,
    columns: [{ key: "label", label }, money("in", "Money in"), money("out", "Money out"), money("net", "Net")],
    rows: list.map((row) => ({ label: row.label, in: row.inMinor, out: row.outMinor, net: row.inMinor - row.outMinor })),
  });
  return [
    { title: "Finance summary", columns: [{ key: "label", label: "Measure" }, money("amount", "Amount")], rows: [{ label: "Money in", amount: report.totals.inMinor }, { label: "Money out", amount: report.totals.outMinor }, { label: "Net", amount: report.totals.netMinor }] },
    grouped("By period", "Period", report.byPeriod),
    grouped("By category", "Category", report.byCategory),
    grouped("By method", "Method", report.byMethod),
    grouped("By item", "Item", report.byItem),
    grouped("By technician", "Technician", report.byTechnician),
    grouped("By supplier", "Supplier", report.bySupplier),
    {
      title: "Entries",
      columns: [{ key: "day", label: "Date" }, { key: "direction", label: "Direction" }, { key: "category", label: "Category" }, { key: "method", label: "Method" }, money("amount", "Amount"), { key: "reference", label: "Reference" }, { key: "source", label: "Source" }, { key: "note", label: "Note" }],
      rows: report.entries.map((entry) => ({ day: entry.day, direction: entry.direction === "IN" ? "In" : "Out", category: CATEGORY_LABEL[entry.category], method: METHOD_LABEL[entry.method], amount: entry.amountMinor, reference: entry.reference, source: entry.reversal ? "Reversal" : entry.source, note: entry.note })),
    },
  ];
}
