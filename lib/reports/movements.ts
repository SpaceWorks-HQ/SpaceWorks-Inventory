import "server-only";

import type { AdjustmentReason, MovementType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeTimeZone } from "@/lib/timeZone";
import type { DateRange } from "./range";
import type { ReportTable } from "./table";

/** Plain words for ledger movement types and adjustment reasons (client-safe copies live in the page). */
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  RECEIPT: "Received", ADJUSTMENT: "Adjusted", COUNT: "Count correction", ISSUE: "Issued on loan", RETURN: "Returned from loan",
  TRANSFER_OUT: "Sent on transfer", TRANSFER_IN: "Received on transfer", TRANSFER_RETURN: "Returned from transfer", TRANSFER_LOSS: "Lost in transit",
  MOVE: "Moved between locations", LOSS: "Lost", DAMAGE: "Damaged", REPAIR: "Repaired", WRITE_OFF: "Written off", RESERVE: "Held", RELEASE: "Released", IMPORT: "Imported",
};

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  RECEIVED: "Received", FOUND: "Found", CORRECTION: "Correction", CONSUMED: "Used up", LOST: "Lost", DAMAGED: "Damaged", EXPIRED: "Expired",
  STOLEN: "Stolen", DONATED: "Donated", RETURNED_TO_SUPPLIER: "Returned to supplier", OTHER: "Other",
};

export type MovementReport = {
  range: { fromDay: string; toDay: string };
  receivedUnits: number;
  receivedValueMinor: number;
  writtenOffUnits: number;
  countVariance: number;
  countsPosted: number;
  byType: { type: MovementType; label: string; movements: number; unitsIn: number; unitsOut: number }[];
  adjustments: { reason: AdjustmentReason | null; label: string; movements: number; unitsIn: number; unitsOut: number }[];
  daily: { day: string; unitsIn: number; unitsOut: number }[];
};

type TypeRow = { type: MovementType; reason: AdjustmentReason | null; movements: bigint; unitsIn: bigint | null; unitsOut: bigint | null; value: bigint | null };

const WRITE_OFF_TYPES: readonly MovementType[] = ["WRITE_OFF", "LOSS", "DAMAGE", "TRANSFER_LOSS"];
/** Adjustments down for these reasons are stock written off, not corrections. */
const WRITE_OFF_REASONS: readonly AdjustmentReason[] = ["LOST", "DAMAGED", "EXPIRED", "STOLEN"];

/** Ledger summary for a date range: what came in, what went out and why. Holds (reserve/release) are left out. */
export async function movementReport(spaceId: string, range: DateRange, timeZone: string): Promise<MovementReport> {
  const zone = safeTimeZone(timeZone);
  const [rows, daily, countsPosted] = await Promise.all([
    prisma.$queryRaw<TypeRow[]>`
      SELECT "type", "reason", COUNT(*) AS "movements",
        SUM(CASE WHEN "quantity" > 0 THEN "quantity" ELSE 0 END) AS "unitsIn",
        SUM(CASE WHEN "quantity" < 0 THEN -"quantity" ELSE 0 END) AS "unitsOut",
        SUM(CASE WHEN "quantity" > 0 THEN "quantity" * COALESCE("unitCostMinor", 0) ELSE 0 END) AS "value"
      FROM "StockMovement"
      WHERE "spaceId" = ${spaceId} AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} AND "type" NOT IN ('RESERVE', 'RELEASE')
      GROUP BY "type", "reason"`,
    prisma.$queryRaw<{ day: string; unitsIn: bigint | null; unitsOut: bigint | null }[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${zone}, 'YYYY-MM-DD') AS "day",
        SUM(CASE WHEN "quantity" > 0 THEN "quantity" ELSE 0 END) AS "unitsIn",
        SUM(CASE WHEN "quantity" < 0 THEN -"quantity" ELSE 0 END) AS "unitsOut"
      FROM "StockMovement"
      WHERE "spaceId" = ${spaceId} AND "createdAt" >= ${range.from} AND "createdAt" < ${range.to} AND "type" NOT IN ('RESERVE', 'RELEASE', 'MOVE')
      GROUP BY 1 ORDER BY 1`,
    prisma.stockCount.count({ where: { spaceId, status: "POSTED", postedAt: { gte: range.from, lt: range.to } } }),
  ]);
  const byType = new Map<MovementType, MovementReport["byType"][number]>();
  const adjustments: MovementReport["adjustments"] = [];
  let receivedUnits = 0;
  let receivedValueMinor = 0;
  let writtenOffUnits = 0;
  let countVariance = 0;
  for (const row of rows) {
    const movements = Number(row.movements);
    const unitsIn = Number(row.unitsIn ?? 0);
    const unitsOut = Number(row.unitsOut ?? 0);
    const entry = byType.get(row.type) ?? { type: row.type, label: MOVEMENT_LABEL[row.type], movements: 0, unitsIn: 0, unitsOut: 0 };
    entry.movements += movements;
    entry.unitsIn += unitsIn;
    entry.unitsOut += unitsOut;
    byType.set(row.type, entry);
    if (row.type === "RECEIPT" || row.type === "IMPORT") {
      receivedUnits += unitsIn;
      receivedValueMinor += Number(row.value ?? 0);
    }
    if (row.type === "ADJUSTMENT") adjustments.push({ reason: row.reason, label: row.reason ? REASON_LABEL[row.reason] : "No reason", movements, unitsIn, unitsOut });
    if (WRITE_OFF_TYPES.includes(row.type) || (row.type === "ADJUSTMENT" && row.reason && WRITE_OFF_REASONS.includes(row.reason))) writtenOffUnits += unitsOut;
    if (row.type === "COUNT") countVariance += unitsIn - unitsOut;
  }
  return {
    range: { fromDay: range.fromDay, toDay: range.toDay },
    receivedUnits,
    receivedValueMinor,
    writtenOffUnits,
    countVariance,
    countsPosted,
    byType: [...byType.values()].sort((a, b) => b.movements - a.movements),
    adjustments: adjustments.sort((a, b) => b.movements - a.movements),
    daily: daily.map((row) => ({ day: row.day, unitsIn: Number(row.unitsIn ?? 0), unitsOut: Number(row.unitsOut ?? 0) })),
  };
}

export function movementTables(report: MovementReport): ReportTable[] {
  const counts = [{ key: "movements", label: "Movements", kind: "number" as const }, { key: "unitsIn", label: "Units in", kind: "number" as const }, { key: "unitsOut", label: "Units out", kind: "number" as const }];
  return [
    { title: "Movements by type", columns: [{ key: "label", label: "Type" }, ...counts], rows: report.byType.map((row) => ({ label: row.label, movements: row.movements, unitsIn: row.unitsIn, unitsOut: row.unitsOut })) },
    { title: "Adjustments by reason", columns: [{ key: "label", label: "Reason" }, ...counts], rows: report.adjustments.map((row) => ({ label: row.label, movements: row.movements, unitsIn: row.unitsIn, unitsOut: row.unitsOut })) },
    { title: "Movements by day", columns: [{ key: "day", label: "Day" }, { key: "unitsIn", label: "Units in", kind: "number" }, { key: "unitsOut", label: "Units out", kind: "number" }], rows: report.daily.map((row) => ({ ...row })) },
  ];
}
