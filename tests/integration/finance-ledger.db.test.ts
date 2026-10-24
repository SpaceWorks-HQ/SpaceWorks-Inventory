import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newQrCode } from "@/lib/catalogue/qr";
import { prisma } from "@/lib/db";
import { createManualEntry, financeReport, ledgerCheck, postFinanceEntry, reverseFinanceEntry } from "@/lib/finance";
import { createLoanCharges } from "@/lib/payments/charges";
import { recordOfflinePayment } from "@/lib/payments/offline";
import { queueRefund } from "@/lib/payments/refunds";
import { settlePayment } from "@/lib/payments/settle";
import { createPurchase, movePurchase, receivePurchase } from "@/lib/purchases";
import { parseRange } from "@/lib/reports/range";
import { saveSettingsSection } from "@/lib/setup/settings";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let other: Awaited<ReturnType<typeof seedSpace>>;
let counter = 0;
const tx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);
const entriesFor = (sourceId: string) => prisma.financeEntry.findMany({ where: { sourceId } });

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  other = await seedSpace(`${suffix}b`);
  await prisma.space.update({ where: { id: ctx.space.id }, data: { depositMode: "FIXED", depositMinor: 10_000, rentalMode: "FLAT", rentalMinor: 2_000 } });
});
afterAll(async () => { await cleanup([ctx.space.slug, other.space.slug], ctx.domain); await cleanup([], other.domain); });

async function owingLoan() {
  counter += 1;
  const item = await prisma.item.create({ data: { spaceId: ctx.space.id, sku: `FIN-${counter}`, name: `Kit ${counter}`, qrCode: newQrCode("item"), lendable: true } });
  const loan = await prisma.loan.create({ data: { spaceId: ctx.space.id, number: 3000 + counter, borrowerId: ctx.member.id, status: "APPROVED", dueAt: new Date(Date.now() + 7 * 864e5), lines: { create: [{ itemId: item.id, quantityRequested: 1, quantityApproved: 1 }] } } });
  await tx((client) => createLoanCharges(client, { loanId: loan.id }));
  return loan;
}

describe("posting from sources", () => {
  it("posts a settled payment once, even when it settles again", async () => {
    const loan = await owingLoan();
    const payment = await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, method: "upi", reference: "UTR-1", actorId: ctx.owner.id }));
    await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id }));
    const entries = await entriesFor(payment.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "IN", category: "LOAN_FEES", amountMinor: 12_000, method: "UPI", reference: "UTR-1", currency: "INR" });
  });

  it("posts a cash refund as money out, and a returned deposit as a deposit refund", async () => {
    const loan = await owingLoan();
    const payment = await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, method: "cash", reference: "", actorId: ctx.owner.id }));
    const refund = await tx((client) => queueRefund(client, { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 2_000, reason: "Rental waived", actorId: ctx.owner.id, cash: true }));
    expect((await entriesFor(refund.id))[0]).toMatchObject({ direction: "OUT", category: "REFUND", amountMinor: 2_000, method: "CASH" });
    const deposit = await tx((client) => queueRefund(client, { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 10_000, reason: "Deposit returned", actorId: ctx.owner.id, cash: true }));
    expect((await entriesFor(deposit.id))[0]).toMatchObject({ category: "DEPOSIT_REFUND", amountMinor: 10_000 });
  });

  it("needs what a purchase cost when it is ordered, and posts it once", async () => {
    const supplier = await prisma.supplier.create({ data: { spaceId: ctx.space.id, name: `Supplier ${suffix}` } });
    const purchase = await tx((client) => createPurchase(client, { spaceId: ctx.space.id, itemId: null, name: "Drill bits", quantity: 3, supplierId: null, unitCostMinor: 500, link: null, note: null }, { userId: ctx.staff.id }));
    await expect(tx((client) => movePurchase(client, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "order" }, { userId: ctx.owner.id }))).rejects.toThrow("Enter what was spent");
    await expect(tx((client) => movePurchase(client, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "order", payment: { amountMinor: 1_600, method: "UPI", reference: null, supplierId: supplier.id } }, { userId: ctx.owner.id }))).rejects.toThrow("reference");
    await expect(tx((client) => movePurchase(client, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "order", payment: { amountMinor: 1_600, method: "UPI", reference: "UPI-9", supplierId: null } }, { userId: ctx.owner.id }))).rejects.toThrow("supplier");
    await tx((client) => movePurchase(client, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "order", payment: { amountMinor: 1_600, method: "UPI", reference: "UPI-9", supplierId: supplier.id } }, { userId: ctx.owner.id }));
    await tx((client) => receivePurchase(client, { spaceId: ctx.space.id, purchaseId: purchase.id, locationId: ctx.shelfA.id, quantity: null, unitCostMinor: null }, { userId: ctx.owner.id }));
    const entries = await entriesFor(purchase.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ direction: "OUT", category: "PURCHASE", amountMinor: 1_600, supplierId: supplier.id, method: "UPI" });
    // Received straight from approved: the cost is recorded at receipt.
    const direct = await tx((client) => createPurchase(client, { spaceId: ctx.space.id, itemId: null, name: "Glue", quantity: 1, supplierId: supplier.id, unitCostMinor: null, link: null, note: null }, { userId: ctx.staff.id }));
    await tx((client) => movePurchase(client, { spaceId: ctx.space.id, purchaseId: direct.id, step: "approve" }, { userId: ctx.owner.id }));
    await tx((client) => receivePurchase(client, { spaceId: ctx.space.id, purchaseId: direct.id, locationId: ctx.shelfA.id, quantity: null, unitCostMinor: null, payment: { amountMinor: 300, method: "CASH", reference: null, supplierId: null } }, { userId: ctx.owner.id }));
    expect((await entriesFor(direct.id))[0]).toMatchObject({ amountMinor: 300, method: "CASH" });
  });
});

describe("the ledger", () => {
  it("records manual entries, reverses each once and never reverses a reversal", async () => {
    const entry = await tx((client) => createManualEntry(client, { spaceId: ctx.space.id, direction: "OUT", category: "RENT", amountMinor: 50_000, method: "BANK_TRANSFER", reference: "NEFT-1", occurredAt: new Date(), note: "Rent", actorId: ctx.owner.id }));
    await expect(tx((client) => createManualEntry(client, { spaceId: ctx.space.id, direction: "IN", category: "RENT", amountMinor: 1, method: "CASH", reference: null, occurredAt: new Date(), note: "x", actorId: ctx.owner.id }))).rejects.toThrow("Choose a category");
    await expect(tx((client) => createManualEntry(client, { spaceId: ctx.space.id, direction: "OUT", category: "UTILITIES", amountMinor: 1, method: "UPI", reference: null, occurredAt: new Date(), note: "x", actorId: ctx.owner.id }))).rejects.toThrow("reference");
    const reversal = await tx((client) => reverseFinanceEntry(client, { spaceId: ctx.space.id, entryId: entry.id, reason: "Typed twice", actorId: ctx.owner.id }));
    expect(reversal).toMatchObject({ direction: "IN", category: "RENT", amountMinor: 50_000, reversesId: entry.id });
    await expect(tx((client) => reverseFinanceEntry(client, { spaceId: ctx.space.id, entryId: entry.id, reason: "Again", actorId: ctx.owner.id }))).rejects.toThrow("already reversed");
    await expect(tx((client) => reverseFinanceEntry(client, { spaceId: ctx.space.id, entryId: reversal.id, reason: "Undo", actorId: ctx.owner.id }))).rejects.toThrow("can't be reversed");
    await expect(tx((client) => reverseFinanceEntry(client, { spaceId: other.space.id, entryId: entry.id, reason: "Other space", actorId: other.owner.id }))).rejects.toThrow("wasn't found");
    expect(await prisma.auditEvent.count({ where: { action: { in: ["finance.entry_created", "finance.entry_reversed"] }, spaceId: ctx.space.id } })).toBeGreaterThanOrEqual(2);
  });

  it("refuses another currency and posts each source once", async () => {
    const base = { spaceId: ctx.space.id, direction: "IN" as const, category: "OTHER_INCOME" as const, amountMinor: 100, method: "CASH" as const, occurredAt: new Date() };
    await expect(tx((client) => postFinanceEntry(client, { ...base, currency: "USD", source: { type: "Manual", id: `usd-${suffix}` } }))).rejects.toThrow("keeps its books in INR");
    const first = await tx((client) => postFinanceEntry(client, { ...base, currency: "INR", source: { type: "Manual", id: `once-${suffix}` } }));
    const again = await tx((client) => postFinanceEntry(client, { ...base, amountMinor: 999, currency: "INR", source: { type: "Manual", id: `once-${suffix}` } }));
    expect(again.id).toBe(first.id);
    expect(again.amountMinor).toBe(100);
  });

  it("is append-only in the database", async () => {
    const entry = await prisma.financeEntry.findFirstOrThrow({ where: { spaceId: ctx.space.id } });
    await expect(prisma.financeEntry.update({ where: { id: entry.id }, data: { note: "edited" } })).rejects.toThrow(/append-only/);
    await expect(prisma.financeEntry.delete({ where: { id: entry.id } })).rejects.toThrow(/append-only/);
  });

  it("keeps the currency once money is recorded", async () => {
    const space = await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } });
    const result = await saveSettingsSection(prisma, space, "general", { name: space.name, tagline: "", address: "", contactEmail: "", timezone: space.timezone, currency: "USD", tagPrefix: space.tagPrefix }, ctx.owner.id);
    expect(result).toMatchObject({ ok: false, fieldErrors: { currency: [expect.stringContaining("can't change")] } });
  });

  it("matches its sources and adds up in the report", async () => {
    expect(await ledgerCheck(ctx.space.id)).toEqual({ ok: true, problems: [] });
    const all = await prisma.financeEntry.findMany({ where: { spaceId: ctx.space.id } });
    const range = parseRange({}, ctx.space.timezone);
    const report = await financeReport({ id: ctx.space.id, slug: ctx.space.slug, timezone: ctx.space.timezone }, range, "month");
    const sum = (direction: "IN" | "OUT") => all.filter((entry) => entry.direction === direction).reduce((total, entry) => total + entry.amountMinor, 0);
    expect(report.totals).toEqual({ inMinor: sum("IN"), outMinor: sum("OUT"), netMinor: sum("IN") - sum("OUT") });
    expect(report.byPeriod.reduce((total, row) => total + row.inMinor, 0)).toBe(sum("IN"));
    expect(report.byCategory.find((row) => row.key === "RENT")).toMatchObject({ inMinor: 50_000, outMinor: 50_000 });
    const otherReport = await financeReport({ id: other.space.id, slug: other.space.slug, timezone: other.space.timezone }, range, "month");
    expect(otherReport.entries).toEqual([]);
  });
});
