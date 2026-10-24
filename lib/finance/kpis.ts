import "server-only";

import { prisma } from "@/lib/db";
import { dayInZone, startOfDay } from "@/lib/reports/range";

/** This month's money in, out and net (space time zone), for the inventory manager's home page. */
export async function financeKpis(space: { id: string; timezone: string }, now = new Date()) {
  const from = startOfDay(`${dayInZone(now, space.timezone).slice(0, 7)}-01`, space.timezone);
  const rows = await prisma.financeEntry.groupBy({ by: ["direction"], where: { spaceId: space.id, occurredAt: { gte: from, lte: now } }, _sum: { amountMinor: true } });
  const sum = (direction: "IN" | "OUT") => rows.find((row) => row.direction === direction)?._sum.amountMinor ?? 0;
  const openRepairs = await prisma.repairIssue.count({ where: { spaceId: space.id, status: { in: ["REPORTED", "ASSIGNED", "FIXED"] } } });
  return { inMinor: sum("IN"), outMinor: sum("OUT"), netMinor: sum("IN") - sum("OUT"), openRepairs };
}
