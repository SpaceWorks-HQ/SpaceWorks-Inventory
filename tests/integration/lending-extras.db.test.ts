import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { receiveStock } from "@/lib/inventory/availability";
import { approveLoan, issueLoan, requestLoan, resolveIncident, returnLoan, selfCheckout } from "@/lib/lending/workflow";
import { runLoanReminders } from "@/lib/lending/reminders";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import { evidence } from "../helpers/evidence";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

async function lendable(name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, lendable: true, ...extra }, { userId: null }));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: item.id, locationId: ctx.shelfA.id, quantity }, { userId: null }));
  return item;
}

describe("self-checkout", () => {
  it("is refused when switched off or for desk-only items, and issues scanned labels otherwise", async () => {
    const tape = await lendable("Masking tape", 5, { selfCheckout: true });
    const lathe = await lendable("Mini lathe", 1);
    const run = (codes: string[]) => prisma.$transaction((tx) => selfCheckout(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, scannedCodes: codes, evidence: { ...evidence(ctx.space.id), scannedCodes: codes } }, { userId: ctx.member.id }));
    await expect(run([tape.qrCode])).rejects.toThrow(/switched off/);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { selfCheckoutEnabled: true } });
    await expect(run([lathe.qrCode])).rejects.toThrow(/at the desk/);
    const loan = await run([tape.qrCode]);
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("ISSUED");
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: tape.id, locationId: ctx.shelfA.id } } })).onHand).toBe(4);
    // Self-return by the borrower with scan, photo and remarks.
    const line = await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, byBorrowerId: ctx.member.id, scannedCodes: [tape.qrCode], lines: [{ lineId: line.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "Back on the shelf") }, { userId: ctx.member.id }));
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("RETURNED");
  });

  it("needs pay-later when self-checkout items carry a fee", async () => {
    await prisma.space.update({ where: { id: ctx.space.id }, data: { rentalMode: "FLAT", rentalMinor: 2000 } });
    const glue = await lendable("Hot glue gun", 2, { selfCheckout: true });
    const run = () => prisma.$transaction((tx) => selfCheckout(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, scannedCodes: [glue.qrCode], evidence: { ...evidence(ctx.space.id), scannedCodes: [glue.qrCode] } }, { userId: ctx.member.id }));
    await expect(run()).rejects.toThrow(/at the desk/);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { payLaterEnabled: true } });
    const loan = await run();
    const payment = await prisma.payment.findFirstOrThrow({ where: { loanId: loan.id } });
    expect(payment).toMatchObject({ payLater: true, status: "PENDING", amountMinor: 2000 });
    await prisma.space.update({ where: { id: ctx.space.id }, data: { rentalMode: "FREE", rentalMinor: 0, payLaterEnabled: false } });
  });
});

describe("reminders and lost items", () => {
  it("sends due-soon and overdue reminders once, restricts and escalates", async () => {
    const drill = await lendable("Drill", 1);
    const loan = await prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, lines: [{ itemId: drill.id, quantity: 1 }], purpose: null, neededFrom: null }, { userId: ctx.member.id }));
    await prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, quantities: null }, { userId: ctx.staff.id }));
    await prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [drill.qrCode], evidence: { ...evidence(ctx.space.id), scannedCodes: [] } }, { userId: ctx.staff.id }));
    await prisma.loan.update({ where: { id: loan.id }, data: { dueAt: new Date(Date.now() + 6 * 3600_000) } });
    await runLoanReminders();
    await runLoanReminders();
    expect(await prisma.notification.count({ where: { userId: ctx.member.id, kind: "loan.due_soon" } })).toBe(1);
    await prisma.loan.update({ where: { id: loan.id }, data: { dueAt: new Date(Date.now() - 5 * 86_400_000) } });
    await runLoanReminders();
    await runLoanReminders();
    expect(await prisma.notification.count({ where: { userId: ctx.member.id, kind: "loan.overdue" } })).toBe(1);
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).borrowingStatus).toBe("RESTRICTED");
    expect(await prisma.notification.count({ where: { spaceId: ctx.space.id, kind: "loan.escalated" } })).toBeGreaterThan(0);
    // Returning it lifts the automatic restriction.
    const line = await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [drill.qrCode], lines: [{ lineId: line.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "Late but fine") }, { userId: ctx.staff.id }));
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).borrowingStatus).toBe("GOOD");
  });

  it("marks a lost asset, charges replacement cost, and brings it back when found", async () => {
    await prisma.space.update({ where: { id: ctx.space.id }, data: { damageChargeMode: "REPLACEMENT_COST" } });
    const meter = await lendable("Meter", 0, { tracking: "SERIALIZED", replacementMinor: 150_000 });
    const [asset] = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: meter.id, locationId: ctx.shelfB.id, count: 1 }, { userId: null }));
    const loan = await prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, lines: [{ itemId: meter.id, quantity: 1 }], purpose: null, neededFrom: null }, { userId: ctx.member.id }));
    await prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, quantities: null }, { userId: ctx.staff.id }));
    await prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [asset!.qrCode], evidence: { ...evidence(ctx.space.id), scannedCodes: [] } }, { userId: ctx.staff.id }));
    const line = await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [], lines: [{ lineId: line.id, returned: 0, damaged: 0, lost: 1 }], evidence: evidence(ctx.space.id, "Left on the bus") }, { userId: ctx.staff.id }));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset!.id } })).toMatchObject({ status: "LOST" });
    expect(await prisma.loanCharge.findFirstOrThrow({ where: { loanId: loan.id, kind: "LOSS" } })).toMatchObject({ amountMinor: 150_000, status: "DUE" });
    const incident = await prisma.loanIncident.findFirstOrThrow({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => resolveIncident(tx, { spaceId: ctx.space.id, incidentId: incident.id, resolution: "FOUND", note: "Turned up at the desk", locationId: ctx.shelfB.id }, { userId: ctx.owner.id }));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: asset!.id } })).toMatchObject({ status: "AVAILABLE", locationId: ctx.shelfB.id });
  });
});
