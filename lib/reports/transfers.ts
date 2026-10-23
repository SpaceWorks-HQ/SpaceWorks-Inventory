import "server-only";

import { prisma } from "@/lib/db";
import { transferRef } from "@/lib/catalogue/references";
import { inTransit, returningOut, type LineCounts } from "@/lib/transfers/policy";
import type { DateRange } from "./range";
import type { ReportTable } from "./table";

const IN_TRANSIT_STATUSES = ["DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"] as const;

type Flow = { spaceId: string; spaceName: string; transfers: number; unitsDispatched: number; unitsReceived: number };

export type TransfersReport = {
  outCount: number;
  inCount: number;
  unitsInTransit: number;
  outBySpace: Flow[];
  inBySpace: Flow[];
  inTransitNow: { transferId: string; reference: string; direction: "out" | "in" | "within"; otherSpace: string; units: number; dispatchedAt: Date | null }[];
  discrepancies: { transferId: string; reference: string; item: string; damaged: number; missing: number }[];
};

const lineSelect = { quantityDispatched: true, quantityReceived: true, quantityDamaged: true, quantityMissing: true, quantityReturning: true, quantityReturned: true } as const;

function direction(spaceId: string, transfer: { sourceSpaceId: string; destSpaceId: string }) {
  if (transfer.sourceSpaceId === transfer.destSpaceId) return "within" as const;
  return transfer.sourceSpaceId === spaceId ? ("out" as const) : ("in" as const);
}

/** Transfers raised in the range by direction and partner space, plus what is on the road now and any shortfalls. */
export async function transfersReport(spaceId: string, range: DateRange): Promise<TransfersReport> {
  const side = { OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] };
  const select = {
    id: true, number: true, sourceSpaceId: true, destSpaceId: true, dispatchedAt: true,
    sourceSpace: { select: { name: true } }, destSpace: { select: { name: true } },
    lines: { select: { ...lineSelect, item: { select: { name: true } } } },
  } as const;
  const [inRange, open] = await Promise.all([
    prisma.transfer.findMany({ where: { ...side, createdAt: { gte: range.from, lt: range.to } }, take: 5000, select }),
    prisma.transfer.findMany({ where: { ...side, status: { in: [...IN_TRANSIT_STATUSES] } }, orderBy: { dispatchedAt: "asc" }, take: 500, select }),
  ]);
  const outFlows = new Map<string, Flow>();
  const inFlows = new Map<string, Flow>();
  const discrepancies: TransfersReport["discrepancies"] = [];
  let outCount = 0;
  let inCount = 0;
  for (const transfer of inRange) {
    const dir = direction(spaceId, transfer);
    const outgoing = dir !== "in";
    if (outgoing) outCount += 1;
    if (dir !== "out") inCount += 1;
    const partnerId = outgoing ? transfer.destSpaceId : transfer.sourceSpaceId;
    const partnerName = dir === "within" ? "Within this space" : outgoing ? transfer.destSpace.name : transfer.sourceSpace.name;
    const flows = outgoing ? outFlows : inFlows;
    const flow = flows.get(partnerId) ?? { spaceId: partnerId, spaceName: partnerName, transfers: 0, unitsDispatched: 0, unitsReceived: 0 };
    flow.transfers += 1;
    for (const line of transfer.lines) {
      flow.unitsDispatched += line.quantityDispatched;
      flow.unitsReceived += line.quantityReceived;
      if (line.quantityDamaged > 0 || line.quantityMissing > 0) discrepancies.push({ transferId: transfer.id, reference: transferRef(transfer.number), item: line.item.name, damaged: line.quantityDamaged, missing: line.quantityMissing });
    }
    flows.set(partnerId, flow);
  }
  const inTransitNow = open.map((transfer) => {
    const dir = direction(spaceId, transfer);
    const units = transfer.lines.reduce((sum, line: LineCounts) => sum + Math.max(0, inTransit(line)) + Math.max(0, returningOut(line)), 0);
    return { transferId: transfer.id, reference: transferRef(transfer.number), direction: dir, otherSpace: dir === "within" ? "Within this space" : dir === "out" ? transfer.destSpace.name : transfer.sourceSpace.name, units, dispatchedAt: transfer.dispatchedAt };
  });
  return {
    outCount,
    inCount,
    unitsInTransit: inTransitNow.reduce((sum, row) => sum + row.units, 0),
    outBySpace: [...outFlows.values()].sort((a, b) => b.transfers - a.transfers),
    inBySpace: [...inFlows.values()].sort((a, b) => b.transfers - a.transfers),
    inTransitNow,
    discrepancies,
  };
}

const DIRECTION_WORD = { out: "Out", in: "In", within: "Within" } as const;

export function transfersTables(report: TransfersReport, formatDate: (date: Date) => string): ReportTable[] {
  const flowColumns = [{ key: "space", label: "Space" }, { key: "transfers", label: "Transfers", kind: "number" as const }, { key: "dispatched", label: "Units sent", kind: "number" as const }, { key: "received", label: "Units received", kind: "number" as const }];
  const flowRows = (rows: Flow[]) => rows.map((row) => ({ space: row.spaceName, transfers: row.transfers, dispatched: row.unitsDispatched, received: row.unitsReceived }));
  return [
    { title: "Transfers out by space", columns: flowColumns, rows: flowRows(report.outBySpace) },
    { title: "Transfers in by space", columns: flowColumns, rows: flowRows(report.inBySpace) },
    {
      title: "In transit now",
      columns: [{ key: "reference", label: "Transfer" }, { key: "direction", label: "Direction" }, { key: "space", label: "Other space" }, { key: "units", label: "Units", kind: "number" }, { key: "dispatched", label: "Dispatched" }],
      rows: report.inTransitNow.map((row) => ({ reference: row.reference, direction: DIRECTION_WORD[row.direction], space: row.otherSpace, units: row.units, dispatched: row.dispatchedAt ? formatDate(row.dispatchedAt) : null })),
    },
    {
      title: "Discrepancies",
      columns: [{ key: "reference", label: "Transfer" }, { key: "item", label: "Item" }, { key: "damaged", label: "Damaged", kind: "number" }, { key: "missing", label: "Missing", kind: "number" }],
      rows: report.discrepancies.map((row) => ({ reference: row.reference, item: row.item, damaged: row.damaged, missing: row.missing })),
    },
  ];
}
