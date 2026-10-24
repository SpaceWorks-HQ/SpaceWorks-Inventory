import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { adjustStock, receiveStock } from "@/lib/inventory/availability";
import { approveLoan, issueLoan, requestLoan } from "@/lib/lending/workflow";
import { createPurchase } from "@/lib/purchases";
import {
  REPORTS, incidentsReport, loansReport, lowStockReport, movementReport, overdueLoansReport, parseRange, paymentsReport, reportTables, transfersReport, valuationReport,
} from "@/lib/reports";
import { tablesToCsv } from "@/lib/reports/table";
import { evidence } from "../helpers/evidence";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };
const DAY = 86_400_000;
let ids: { drill: string; gloves: string; iron: string; loan: string };

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  const space = ctx.space.id;
  const category = await prisma.category.create({ data: { spaceId: space, name: "Power tools" } });
  const drill = await prisma.$transaction((tx) => createItem(tx, space, { name: "Drill", categoryId: category.id }, system));
  const gloves = await prisma.$transaction((tx) => createItem(tx, space, { name: "Gloves", reorderPoint: 6, reorderQuantity: 10 }, system));
  const iron = await prisma.$transaction((tx) => createItem(tx, space, { name: "Soldering iron", lendable: true }, system));
  await prisma.$transaction(async (tx) => {
    await receiveStock(tx, { spaceId: space, itemId: drill.id, locationId: ctx.shelfA.id, quantity: 10, unitCostMinor: 1000 }, system);
    await receiveStock(tx, { spaceId: space, itemId: drill.id, locationId: ctx.shelfB.id, quantity: 10, unitCostMinor: 2000 }, system);
    await receiveStock(tx, { spaceId: space, itemId: gloves.id, locationId: ctx.shelfB.id, quantity: 5, unitCostMinor: 200 }, system);
    await receiveStock(tx, { spaceId: space, itemId: iron.id, locationId: ctx.shelfA.id, quantity: 3, unitCostMinor: 500 }, system);
    await adjustStock(tx, { spaceId: space, itemId: gloves.id, locationId: ctx.shelfB.id, delta: -2, reason: "DAMAGED" }, system);
  });
  await prisma.$transaction((tx) => createPurchase(tx, { spaceId: space, itemId: gloves.id, name: "", quantity: 4, supplierId: null, unitCostMinor: null, link: null, note: null }, { userId: ctx.staff.id }));
  const loan = await prisma.$transaction((tx) => requestLoan(tx, { spaceId: space, borrowerId: ctx.member.id, lines: [{ itemId: iron.id, quantity: 2 }], purpose: null, neededFrom: null }, { userId: ctx.member.id }));
  await prisma.$transaction((tx) => approveLoan(tx, { spaceId: space, loanId: loan.id, quantities: null }, { userId: ctx.staff.id }));
  await prisma.$transaction((tx) => issueLoan(tx, { spaceId: space, loanId: loan.id, scannedCodes: [iron.qrCode], evidence: { ...evidence(space, "Boxed"), scannedCodes: [iron.qrCode] } }, { userId: ctx.staff.id }));
  // Due three days (and an hour) ago.
  await prisma.loan.update({ where: { id: loan.id }, data: { dueAt: new Date(Date.now() - 3 * DAY - 3_600_000) } });
  ids = { drill: drill.id, gloves: gloves.id, iron: iron.id, loan: loan.id };
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

describe("stock reports", () => {
  it("values on-hand stock at average cost by item, category and location", async () => {
    const report = await valuationReport(ctx.space.id);
    expect(report.currency).toBe("INR");
    const drill = report.items.find((row) => row.itemId === ids.drill)!;
    expect(drill).toMatchObject({ onHand: 20, avgCostMinor: 1500, valueMinor: 30000, inTransit: 0 });
    expect(report.items.find((row) => row.itemId === ids.gloves)).toMatchObject({ onHand: 3, valueMinor: 600 });
    expect(report.items.find((row) => row.itemId === ids.iron)).toMatchObject({ onHand: 1, valueMinor: 500 });
    expect(report.totalMinor).toBe(31100);
    expect(report.inTransitMinor).toBe(0);
    expect(report.byCategory.find((row) => row.name === "Power tools")).toMatchObject({ onHand: 20, valueMinor: 30000 });
    expect(report.byCategory.find((row) => row.categoryId === null)).toMatchObject({ onHand: 4, valueMinor: 1100 });
    const shelfA = report.byLocation.find((row) => row.locationId === ctx.shelfA.id)!;
    expect(shelfA).toMatchObject({ code: "R1-A", onHand: 11, valueMinor: 10 * 1500 + 500 });
  });

  it("lists low stock with what is already on the buy list", async () => {
    const rows = await lowStockReport(ctx.space.id);
    expect(rows).toEqual([expect.objectContaining({ itemId: ids.gloves, available: 3, reorderPoint: 6, reorderQuantity: 10, onOrder: 4, supplier: null })]);
  });

  it("summarises the ledger for the period: receipts, write-offs and loans out", async () => {
    const range = parseRange({}, ctx.space.timezone);
    const report = await movementReport(ctx.space.id, range, ctx.space.timezone);
    expect(report.receivedUnits).toBe(28);
    expect(report.receivedValueMinor).toBe(10 * 1000 + 10 * 2000 + 5 * 200 + 3 * 500);
    expect(report.writtenOffUnits).toBe(2);
    expect(report.adjustments).toEqual([expect.objectContaining({ reason: "DAMAGED", movements: 1, unitsIn: 0, unitsOut: 2 })]);
    expect(report.byType.find((row) => row.type === "ISSUE")).toMatchObject({ unitsOut: 2 });
    expect(report.byType.some((row) => row.type === "RESERVE")).toBe(false);
    const totals = report.daily.reduce((sum, row) => ({ unitsIn: sum.unitsIn + row.unitsIn, unitsOut: sum.unitsOut + row.unitsOut }), { unitsIn: 0, unitsOut: 0 });
    expect(totals).toEqual({ unitsIn: 28, unitsOut: 4 });
    const earlier = await movementReport(ctx.space.id, parseRange({ from: "2020-01-01", to: "2020-01-31" }, ctx.space.timezone), ctx.space.timezone);
    expect(earlier.receivedUnits).toBe(0);
  });
});

describe("lending reports", () => {
  it("lists overdue loans with whole days and units still out", async () => {
    const rows = await overdueLoansReport(ctx.space.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ loanId: ids.loan, borrowerId: ctx.member.id, borrowerName: "Member", daysOverdue: 3, units: 2 });
    expect(rows[0]!.reference).toMatch(/^LN-\d{4}$/);
    expect(await overdueLoansReport(ctx.space.id, new Date(Date.now() - 10 * DAY))).toHaveLength(0);
  });

  it("reports active loans, members, popular items and how much lendable stock is out", async () => {
    const report = await loansReport(ctx.space.id, parseRange({}, ctx.space.timezone));
    expect(report).toMatchObject({ activeLoans: 1, unitsOut: 2, issuedInRange: 1 });
    expect(report.utilisation).toBeCloseTo(2 / 3);
    expect(report.byMember).toEqual([expect.objectContaining({ borrowerId: ctx.member.id, activeLoans: 1, unitsOut: 2, overdueLoans: 1, loansInRange: 1 })]);
    expect(report.mostBorrowed).toEqual([expect.objectContaining({ itemId: ids.iron, loans: 1, units: 2 })]);
  });

  it("answers empty incident, transfer and payment summaries without errors", async () => {
    const range = parseRange({}, ctx.space.timezone);
    expect(await incidentsReport(ctx.space.id, range)).toMatchObject({ openNow: 0, raisedInRange: 0, byItem: [] });
    expect(await transfersReport(ctx.space.id, range)).toMatchObject({ outCount: 0, inCount: 0, unitsInTransit: 0 });
    expect(await paymentsReport(ctx.space.id, range)).toMatchObject({ hasPayments: false, collectedMinor: 0, dueMinor: 0 });
  });
});

describe("exports", () => {
  it("builds tables for every report, with money in major units", async () => {
    const range = parseRange({}, ctx.space.timezone);
    for (const report of REPORTS) {
      const { tables } = await reportTables(report.key, { id: ctx.space.id, timezone: ctx.space.timezone }, range);
      expect(tables.length, report.key).toBeGreaterThan(0);
    }
    const { tables } = await reportTables("valuation", { id: ctx.space.id, timezone: ctx.space.timezone }, range);
    const csv = tablesToCsv(tables, "INR");
    expect(csv).toContain("Value (INR)");
    expect(csv).toContain(`${await prisma.item.findUniqueOrThrow({ where: { id: ids.drill } }).then((item) => item.sku)},Drill,20,15,300,0,0`);
  });

  it("never mixes another space's stock into a report", async () => {
    const other = await seedSpace(uniqueSuffix());
    try {
      expect((await valuationReport(other.space.id)).totalMinor).toBe(0);
      expect(await overdueLoansReport(other.space.id)).toEqual([]);
    } finally {
      await cleanup([other.space.slug], other.domain);
    }
  });
});
