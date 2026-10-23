import "server-only";

import { prisma } from "@/lib/db";
import type { DateRange } from "./range";
import type { ReportTable } from "./table";

type Tally = { lost: number; damaged: number; open: number; resolved: number };

export type IncidentsReport = {
  openNow: number;
  raisedInRange: number;
  resolvedInRange: number;
  lostUnits: number;
  damagedUnits: number;
  byItem: ({ itemId: string; sku: string; name: string } & Tally)[];
  byMember: ({ borrowerId: string; name: string | null } & Tally)[];
};

/** Lost and damaged loan lines raised in the range, with everything still open today. */
export async function incidentsReport(spaceId: string, range: DateRange): Promise<IncidentsReport> {
  const [incidents, openNow, resolvedInRange] = await Promise.all([
    prisma.loanIncident.findMany({
      where: { spaceId, createdAt: { gte: range.from, lt: range.to } },
      take: 5000,
      select: { kind: true, quantity: true, status: true, borrowerId: true, line: { select: { itemId: true, item: { select: { sku: true, name: true } } } } },
    }),
    prisma.loanIncident.count({ where: { spaceId, status: "OPEN" } }),
    prisma.loanIncident.count({ where: { spaceId, status: "RESOLVED", resolvedAt: { gte: range.from, lt: range.to } } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(incidents.map((i) => i.borrowerId))] } }, select: { id: true, name: true } });
  const names = new Map(users.map((user) => [user.id, user.name]));
  const items = new Map<string, IncidentsReport["byItem"][number]>();
  const members = new Map<string, IncidentsReport["byMember"][number]>();
  let lostUnits = 0;
  let damagedUnits = 0;
  const add = (tally: Tally, incident: (typeof incidents)[number]) => {
    if (incident.kind === "LOST") tally.lost += incident.quantity;
    else tally.damaged += incident.quantity;
    if (incident.status === "OPEN") tally.open += 1;
    else tally.resolved += 1;
  };
  for (const incident of incidents) {
    if (incident.kind === "LOST") lostUnits += incident.quantity;
    else damagedUnits += incident.quantity;
    const item = items.get(incident.line.itemId) ?? { itemId: incident.line.itemId, sku: incident.line.item.sku, name: incident.line.item.name, lost: 0, damaged: 0, open: 0, resolved: 0 };
    add(item, incident);
    items.set(item.itemId, item);
    const member = members.get(incident.borrowerId) ?? { borrowerId: incident.borrowerId, name: names.get(incident.borrowerId) ?? null, lost: 0, damaged: 0, open: 0, resolved: 0 };
    add(member, incident);
    members.set(member.borrowerId, member);
  }
  const weight = (row: Tally) => row.lost + row.damaged;
  return {
    openNow,
    raisedInRange: incidents.length,
    resolvedInRange,
    lostUnits,
    damagedUnits,
    byItem: [...items.values()].sort((a, b) => weight(b) - weight(a)),
    byMember: [...members.values()].sort((a, b) => weight(b) - weight(a)),
  };
}

const TALLY_COLUMNS = [
  { key: "lost", label: "Units lost", kind: "number" as const },
  { key: "damaged", label: "Units damaged", kind: "number" as const },
  { key: "open", label: "Open", kind: "number" as const },
  { key: "resolved", label: "Resolved", kind: "number" as const },
];

export function incidentsTables(report: IncidentsReport): ReportTable[] {
  return [
    { title: "Incidents by item", columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, ...TALLY_COLUMNS], rows: report.byItem.map((row) => ({ sku: row.sku, name: row.name, lost: row.lost, damaged: row.damaged, open: row.open, resolved: row.resolved })) },
    { title: "Incidents by member", columns: [{ key: "name", label: "Member" }, ...TALLY_COLUMNS], rows: report.byMember.map((row) => ({ name: row.name ?? "Member", lost: row.lost, damaged: row.damaged, open: row.open, resolved: row.resolved })) },
  ];
}
