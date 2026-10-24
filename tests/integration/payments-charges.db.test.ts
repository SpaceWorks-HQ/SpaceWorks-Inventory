import type { LoanStatus, Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newQrCode } from "@/lib/catalogue/qr";
import { prisma } from "@/lib/db";
import {
  addIncidentCharge, addLateFee, addRenewalCharge, assertIssueAllowed, cancelOpenCharges, createLoanCharges, loanPaymentSummary, payLaterForLoan, waiveCharge,
} from "@/lib/payments/charges";
import { recordOfflinePayment, submitOfflinePayment } from "@/lib/payments/offline";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let counter = 0;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => {
  await prisma.gatewayEvent.deleteMany({ where: { spaceId: ctx.space.id } });
  await cleanup([ctx.space.slug], ctx.domain);
});

const FREE: Prisma.SpaceUpdateInput = { depositMode: "NONE", depositMinor: 0, rentalMode: "FREE", rentalMinor: 0, lateFeePerDayMinor: 0, lateFeeCapMinor: 0, lateFeeGraceDays: 0, damageChargeMode: "NONE", damageChargeMinor: 0, paymentBeforeIssue: true, payLaterEnabled: false };
const policy = (data: Prisma.SpaceUpdateInput) => prisma.space.update({ where: { id: ctx.space.id }, data: { ...FREE, ...data } });
beforeEach(async () => { await policy({}); });

async function item(extra: Partial<Prisma.ItemUncheckedCreateInput> = {}) {
  counter += 1;
  return prisma.item.create({ data: { spaceId: ctx.space.id, sku: `PAY-${counter}`, name: `Tool ${counter}`, qrCode: newQrCode("item"), lendable: true, ...extra } });
}

async function loan(lines: Array<{ itemId: string; quantity: number }>, options: { status?: LoanStatus; days?: number; issued?: boolean } = {}) {
  counter += 1;
  const issuedAt = options.issued ? new Date() : null;
  return prisma.loan.create({
    data: {
      spaceId: ctx.space.id, number: 1000 + counter, borrowerId: ctx.member.id, status: options.status ?? "APPROVED", issuedAt,
      dueAt: new Date(Date.now() + (options.days ?? 7) * DAY + 60_000),
      lines: { create: lines.map((line) => ({ itemId: line.itemId, quantityRequested: line.quantity, quantityApproved: line.quantity, quantityIssued: options.issued ? line.quantity : 0 })) },
    },
    include: { lines: true },
  });
}

const tx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);
const charges = (loanId: string) => prisma.loanCharge.findMany({ where: { loanId }, orderBy: { kind: "asc" } });

describe("createLoanCharges", () => {
  it("creates nothing when lending is free", async () => {
    const drill = await item();
    const l = await loan([{ itemId: drill.id, quantity: 1 }]);
    expect(await tx((client) => createLoanCharges(client, { loanId: l.id }))).toEqual([]);
  });

  it("creates deposit and rental with overrides, and is idempotent", async () => {
    await policy({ depositMode: "PER_ITEM", depositMinor: 10_000, rentalMode: "PER_DAY", rentalMinor: 1_000 });
    const category = await prisma.category.create({ data: { spaceId: ctx.space.id, name: `Saws ${suffix}`, depositMinor: 25_000 } });
    const saw = await item({ categoryId: category.id });
    const glue = await item({ consumable: true });
    const l = await loan([{ itemId: saw.id, quantity: 2 }, { itemId: glue.id, quantity: 3 }], { days: 3 });
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    const rows = await charges(l.id);
    expect(rows.map((row) => [row.kind, row.amountMinor, row.status, row.currency])).toEqual([["DEPOSIT", 50_000, "DUE", "INR"], ["RENTAL", 6_000, "DUE", "INR"]]);

    await policy({ depositMode: "FIXED", depositMinor: 30_000, rentalMode: "FREE" });
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    expect((await charges(l.id)).map((row) => [row.kind, row.amountMinor])).toEqual([["DEPOSIT", 30_000]]);
  });

  it("leaves charges alone once someone started paying them", async () => {
    await policy({ depositMode: "FIXED", depositMinor: 30_000, payLaterEnabled: true });
    const l = await loan([{ itemId: (await item()).id, quantity: 1 }]);
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    await tx((client) => payLaterForLoan(client, { loanId: l.id, payerId: ctx.member.id }));
    await policy({ depositMode: "FIXED", depositMinor: 99_000 });
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    expect((await charges(l.id)).map((row) => row.amountMinor)).toEqual([30_000]);
  });
});

describe("assertIssueAllowed", () => {
  async function owing() {
    await policy({ depositMode: "FIXED", depositMinor: 20_000 });
    const l = await loan([{ itemId: (await item()).id, quantity: 1 }]);
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    return l;
  }

  it("refuses while the deposit is due", async () => {
    const l = await owing();
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).rejects.toThrow("Collect the deposit and rental first, or mark it pay later.");
  });

  it("allows once it is paid at the desk", async () => {
    const l = await owing();
    await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: l.id, method: "cash", reference: "", actorId: ctx.staff.id }));
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).resolves.toBeUndefined();
    expect((await charges(l.id))[0]!.status).toBe("PAID");
  });

  it("allows a pay-later promise", async () => {
    const l = await owing();
    const promise = await tx((client) => payLaterForLoan(client, { loanId: l.id, payerId: ctx.member.id }));
    expect(promise.amountMinor).toBe(20_000);
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).resolves.toBeUndefined();
    const summary = await loanPaymentSummary(prisma, l.id);
    expect(summary.charges[0]!.statusLabel).toBe("Payment pending");
    expect(summary.headline.label).toBe("Payment pending");
  });

  it("refuses an offline payment still awaiting confirmation", async () => {
    const l = await owing();
    await tx((client) => submitOfflinePayment(client, { spaceId: ctx.space.id, loanId: l.id, payerId: ctx.member.id, method: "upi", reference: "UTR123" }));
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).rejects.toThrow(/Collect the deposit/);
  });

  it("does nothing when the space doesn't need money first", async () => {
    const l = await owing();
    await policy({ paymentBeforeIssue: false });
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).resolves.toBeUndefined();
  });
});

describe("fees after issue", () => {
  it("adds a late fee once", async () => {
    await policy({ lateFeePerDayMinor: 1_500, lateFeeCapMinor: 4_000 });
    const l = await loan([{ itemId: (await item()).id, quantity: 1 }], { status: "RETURNED", issued: true, days: 1 });
    const returnedAt = new Date(l.dueAt.getTime() + 5 * DAY);
    const fee = await tx((client) => addLateFee(client, { loanId: l.id, returnedAt }));
    expect(fee?.amountMinor).toBe(4_000);
    await tx((client) => addLateFee(client, { loanId: l.id, returnedAt }));
    expect(await prisma.loanCharge.count({ where: { loanId: l.id, kind: "LATE_FEE" } })).toBe(1);
  });

  it("charges an incident at replacement cost, once", async () => {
    await policy({ damageChargeMode: "REPLACEMENT_COST" });
    const drill = await item({ unitCostMinor: 50_000, replacementMinor: 70_000 });
    const l = await loan([{ itemId: drill.id, quantity: 2 }], { status: "ISSUED", issued: true });
    const incident = await prisma.loanIncident.create({ data: { spaceId: ctx.space.id, loanId: l.id, lineId: l.lines[0]!.id, borrowerId: ctx.member.id, kind: "LOST", quantity: 2, description: "Lost" } });
    const charge = await tx((client) => addIncidentCharge(client, { incidentId: incident.id }));
    expect(charge).toMatchObject({ kind: "LOSS", amountMinor: 140_000, incidentId: incident.id });
    expect((await tx((client) => addIncidentCharge(client, { incidentId: incident.id })))?.id).toBe(charge!.id);
  });

  it("adds rental for a renewal under per-day rental only", async () => {
    await policy({ rentalMode: "PER_DAY", rentalMinor: 1_000 });
    const l = await loan([{ itemId: (await item()).id, quantity: 2 }], { status: "ISSUED", issued: true, days: 14 });
    const charge = await tx((client) => addRenewalCharge(client, { loanId: l.id, extraDays: 7 }));
    expect(charge).toMatchObject({ kind: "RENTAL", amountMinor: 14_000, description: "Rental for 7 more days" });
    await policy({ rentalMode: "FLAT", rentalMinor: 1_000 });
    expect(await tx((client) => addRenewalCharge(client, { loanId: l.id, extraDays: 7 }))).toBeNull();
  });
});

describe("waivers and cancellation", () => {
  it("waives a due charge only with a reason", async () => {
    await policy({ depositMode: "FIXED", depositMinor: 5_000 });
    const l = await loan([{ itemId: (await item()).id, quantity: 1 }]);
    const [deposit] = await tx((client) => createLoanCharges(client, { loanId: l.id }));
    await expect(tx((client) => waiveCharge(client, { spaceId: ctx.space.id, chargeId: deposit!.id, reason: "  ", actorId: ctx.staff.id }))).rejects.toThrow(/reason/);
    const waived = await tx((client) => waiveCharge(client, { spaceId: ctx.space.id, chargeId: deposit!.id, reason: "Regular volunteer", actorId: ctx.staff.id }));
    expect(waived).toMatchObject({ status: "WAIVED", waivedReason: "Regular volunteer", waivedById: ctx.staff.id });
    await expect(tx((client) => waiveCharge(client, { spaceId: ctx.space.id, chargeId: deposit!.id, reason: "Again", actorId: ctx.staff.id }))).rejects.toThrow(/still due/);
    await expect(tx((client) => assertIssueAllowed(client, { loanId: l.id }))).resolves.toBeUndefined();
  });

  it("cancels due charges and queues a full refund of what was paid", async () => {
    await policy({ depositMode: "FIXED", depositMinor: 8_000, rentalMode: "FLAT", rentalMinor: 2_000 });
    const l = await loan([{ itemId: (await item()).id, quantity: 1 }]);
    await tx((client) => createLoanCharges(client, { loanId: l.id }));
    const paid = await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: l.id, method: "cash", reference: "", actorId: ctx.staff.id }));
    await prisma.loanCharge.create({ data: { spaceId: ctx.space.id, loanId: l.id, kind: "LATE_FEE", description: "Late", amountMinor: 500, currency: "INR" } });
    const { refundIds } = await tx((client) => cancelOpenCharges(client, { loanId: l.id, reason: "Member changed plans" }));
    expect(refundIds).toHaveLength(1);
    const refund = await prisma.refund.findUniqueOrThrow({ where: { id: refundIds[0]! } });
    expect(refund).toMatchObject({ paymentId: paid.id, amountMinor: 10_000, status: "PENDING" });
    expect((await charges(l.id)).find((row) => row.kind === "LATE_FEE")?.status).toBe("CANCELLED");
    expect((await tx((client) => cancelOpenCharges(client, { loanId: l.id, reason: "again" }))).refundIds).toEqual([]);
  });
});
