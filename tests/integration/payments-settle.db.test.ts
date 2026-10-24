import type { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { newQrCode } from "@/lib/catalogue/qr";
import { prisma } from "@/lib/db";
import { createLoanCharges, loanPaymentSummary, payLaterForLoan } from "@/lib/payments/charges";
import { paymentConfigSchema, savePaymentConfig } from "@/lib/payments/config";
import { recordOfflinePayment, reviewOfflinePayment, submitOfflinePayment } from "@/lib/payments/offline";
import { processQueuedRefunds, retryRefund } from "@/lib/payments/refundGateway";
import { queueRefund, returnDeposit } from "@/lib/payments/refunds";
import { settlePayment } from "@/lib/payments/settle";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let counter = 0;
const tx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  await prisma.space.update({ where: { id: ctx.space.id }, data: { depositMode: "FIXED", depositMinor: 10_000, rentalMode: "FLAT", rentalMinor: 2_000, payLaterEnabled: true } });
  await savePaymentConfig(ctx.space.id, paymentConfigSchema.parse({ razorpayEnabled: true, razorpayKeyId: "rzp_test_unit", razorpaySecret: "rzp-secret", razorpayWebhookSecret: "rzp-webhook", stripeEnabled: false, testMode: true, offlineEnabled: true }), { userId: ctx.owner.id });
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });
afterEach(() => { vi.unstubAllGlobals(); });

async function owingLoan(status: "APPROVED" | "RETURNED" = "APPROVED") {
  counter += 1;
  const item = await prisma.item.create({ data: { spaceId: ctx.space.id, sku: `SET-${counter}`, name: `Kit ${counter}`, qrCode: newQrCode("item"), lendable: true } });
  const loan = await prisma.loan.create({
    data: { spaceId: ctx.space.id, number: 2000 + counter, borrowerId: ctx.member.id, status: "APPROVED", dueAt: new Date(Date.now() + 7 * 864e5), lines: { create: [{ itemId: item.id, quantityRequested: 1, quantityApproved: 1 }] } },
  });
  await tx((client) => createLoanCharges(client, { loanId: loan.id }));
  if (status !== "APPROVED") await prisma.loan.update({ where: { id: loan.id }, data: { status } });
  return loan;
}

async function gatewayPayment(loanId: string, provider: "RAZORPAY" | "STRIPE" = "RAZORPAY") {
  const payment = await prisma.payment.create({ data: { spaceId: ctx.space.id, loanId, payerId: ctx.member.id, provider, amountMinor: 12_000, currency: "INR", gatewayOrderId: `order_${suffix}_${++counter}` } });
  await prisma.loanCharge.updateMany({ where: { loanId, status: "DUE" }, data: { paymentId: payment.id } });
  return payment;
}

const capture = (amountMinor = 12_000) => ({ gatewayPaymentId: `pay_${counter}`, amountMinor, currency: "INR", method: "upi" });

describe("settlePayment", () => {
  it("marks a payment and its charges paid exactly once", async () => {
    const loan = await owingLoan();
    const payment = await gatewayPayment(loan.id);
    const first = await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id, capture: capture() }));
    const second = await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id, capture: capture() }));
    expect(first).toMatchObject({ alreadySettled: false, flagged: false });
    expect(second.alreadySettled).toBe(true);
    expect(await prisma.loanCharge.count({ where: { loanId: loan.id, status: "PAID" } })).toBe(2);
    expect(await prisma.auditEvent.count({ where: { action: "payment.paid", targetId: payment.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ctx.member.id, kind: "payment.succeeded" } })).toBeGreaterThanOrEqual(1);
  });

  it("records and flags an amount mismatch instead of accepting it", async () => {
    const loan = await owingLoan();
    const payment = await gatewayPayment(loan.id);
    const result = await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id, capture: capture(11_999) }));
    expect(result.flagged).toBe(true);
    expect(result.payment).toMatchObject({ status: "PAID", amountMinor: 11_999 });
    expect(result.payment.note).toMatch(/^Flagged: Received/);
    expect(await prisma.loanCharge.findMany({ where: { loanId: loan.id }, select: { status: true, paymentId: true } })).toEqual([{ status: "DUE", paymentId: null }, { status: "DUE", paymentId: null }]);
    const summary = await loanPaymentSummary(prisma, loan.id);
    expect(summary.actions.refundPaymentIds).toEqual([payment.id]);
    expect(summary.totals.dueMinor).toBe(12_000);
  });

  it("flags money that arrives on a closed attempt", async () => {
    const loan = await owingLoan();
    const payment = await gatewayPayment(loan.id);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
    const result = await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id, capture: capture() }));
    expect(result.payment.note).toMatch(/after this attempt was closed/);
  });

  it("turns a pay-later promise into a desk payment", async () => {
    const loan = await owingLoan();
    const promise = await tx((client) => payLaterForLoan(client, { loanId: loan.id, payerId: ctx.member.id }));
    await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, method: "upi", reference: "UTR9", actorId: ctx.staff.id }));
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: promise.paymentId! } })).toMatchObject({ status: "CANCELLED", note: "Paid another way." });
    expect((await loanPaymentSummary(prisma, loan.id)).headline.label).toBe("Paid");
  });

  it("confirms or rejects a borrower's offline payment", async () => {
    const loan = await owingLoan();
    const submitted = await tx((client) => submitOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, payerId: ctx.member.id, method: "upi", reference: "UTR1" }));
    expect(submitted.status).toBe("AWAITING_CONFIRMATION");
    await tx((client) => reviewOfflinePayment(client, { spaceId: ctx.space.id, paymentId: submitted.id, decision: "reject", reason: "No UTR match", actorId: ctx.staff.id }));
    expect(await prisma.loanCharge.count({ where: { loanId: loan.id, status: "DUE", paymentId: null } })).toBe(2);
    const again = await tx((client) => submitOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, payerId: ctx.member.id, method: "upi", reference: "UTR2" }));
    const paid = await tx((client) => reviewOfflinePayment(client, { spaceId: ctx.space.id, paymentId: again.id, decision: "confirm", actorId: ctx.staff.id }));
    expect(paid.status).toBe("PAID");
  });
});

describe("refunds", () => {
  async function paidAtDesk() {
    const loan = await owingLoan("RETURNED");
    const payment = await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, method: "cash", reference: "", actorId: ctx.staff.id }));
    return { loan, payment };
  }
  const deposit = (loanId: string) => prisma.loanCharge.findFirstOrThrow({ where: { loanId, kind: "DEPOSIT" } });

  it("returns a cash deposit in full, once", async () => {
    const { loan } = await paidAtDesk();
    const refund = await tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 0, reason: "", actorId: ctx.staff.id }));
    expect(refund).toMatchObject({ status: "PROCESSED", amountMinor: 10_000 });
    expect((await deposit(loan.id)).refundedMinor).toBe(10_000);
    await expect(tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 0, reason: "", actorId: ctx.staff.id }))).rejects.toThrow(/already returned/);
  });

  it("keeps part of a deposit only with a reason", async () => {
    const { loan } = await paidAtDesk();
    await expect(tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 3_000, reason: " ", actorId: ctx.staff.id }))).rejects.toThrow(/Say why/);
    const refund = await tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 3_000, reason: "Chipped blade", actorId: ctx.staff.id }));
    expect(refund?.amountMinor).toBe(7_000);
    expect(await deposit(loan.id)).toMatchObject({ refundedMinor: 7_000, waivedReason: "Chipped blade", waivedById: ctx.staff.id });
    const summary = await loanPaymentSummary(prisma, loan.id);
    expect(summary.charges.find((charge) => charge.kind === "DEPOSIT")?.statusLabel).toBe("Refunded ₹70.00");
    await expect(tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 0, reason: "", actorId: ctx.staff.id }))).rejects.toThrow(/already settled/);
  });

  it("never refunds more than was paid", async () => {
    const { payment, loan } = await paidAtDesk();
    await expect(tx((client) => queueRefund(client, { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 12_001, reason: "Too much", actorId: ctx.staff.id, cash: true }))).rejects.toThrow(/more than is left/);
    await tx((client) => queueRefund(client, { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 12_000, reason: "All", actorId: ctx.staff.id, cash: true }));
    await expect(tx((client) => queueRefund(client, { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 1, reason: "More", actorId: ctx.staff.id, cash: true }))).rejects.toThrow(/more than is left/);
    await expect(prisma.loanCharge.update({ where: { id: (await deposit(loan.id)).id }, data: { refundedMinor: 10_001 } })).rejects.toThrow();
  });

  it("refunds a gateway deposit through the provider outside the transaction, and retries a failure", async () => {
    const loan = await owingLoan();
    const payment = await gatewayPayment(loan.id);
    await tx((client) => settlePayment(client, { spaceId: ctx.space.id, paymentId: payment.id, capture: capture() }));
    await prisma.loan.update({ where: { id: loan.id }, data: { status: "RETURNED" } });

    const refusing = vi.fn(async (url: string) => (String(url).includes("/refunds?") ? Response.json({ items: [] }) : Response.json({ error: { description: "Refund not allowed" } }, { status: 400 })));
    vi.stubGlobal("fetch", refusing);
    const refund = await tx((client) => returnDeposit(client, { spaceId: ctx.space.id, loanId: loan.id, deductionMinor: 0, reason: "", actorId: ctx.staff.id }));
    expect(refund?.status).toBe("PENDING");
    const [failed] = await processQueuedRefunds(ctx.space.id, [refund!.id]);
    expect(failed?.status).toBe("FAILED");

    const accepting = vi.fn(async (url: string, init?: RequestInit) => (init?.method === "POST" ? Response.json({ id: "rfnd_ok", status: "processed" }) : Response.json({ items: [] })));
    vi.stubGlobal("fetch", accepting);
    expect((await retryRefund(ctx.space.id, refund!.id, ctx.staff.id)).status).toBe("PROCESSED");
    expect(accepting.mock.calls.some(([url, init]) => init?.method === "POST" && String(url).endsWith("/refund"))).toBe(true);
    expect((await deposit(loan.id)).refundedMinor).toBe(10_000);
    await expect(retryRefund(ctx.space.id, refund!.id, ctx.staff.id)).rejects.toThrow(/already tried again/);
  });
});
