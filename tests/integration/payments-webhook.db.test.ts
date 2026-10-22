import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/payments/[provider]/[code]/route";
import { newQrCode } from "@/lib/catalogue/qr";
import { prisma } from "@/lib/db";
import { createLoanCharges } from "@/lib/payments/charges";
import { startCheckout } from "@/lib/payments/checkout";
import { paymentConfigSchema, savePaymentConfig } from "@/lib/payments/config";
import { reconcilePendingPayments } from "@/lib/payments/reconcile";
import { recordOfflinePayment } from "@/lib/payments/offline";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let code: string;
let counter = 0;
const tx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);
const hmac = (secret: string, value: string) => crypto.createHmac("sha256", secret).update(value).digest("hex");

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  await prisma.space.update({ where: { id: ctx.space.id }, data: { depositMode: "FIXED", depositMinor: 10_000 } });
  await savePaymentConfig(ctx.space.id, paymentConfigSchema.parse({
    razorpayEnabled: true, razorpayKeyId: "rzp_test_e2e", razorpaySecret: "rzp-secret", razorpayWebhookSecret: "rzp-hook",
    stripeEnabled: true, stripeSecret: "sk_test_e2e", stripeWebhookSecret: "whsec_e2e", testMode: true, offlineEnabled: true,
  }), { userId: ctx.owner.id });
  code = (await prisma.spacePaymentConfig.findUniqueOrThrow({ where: { spaceId: ctx.space.id } })).webhookPublicCode;
});
afterAll(async () => {
  await prisma.gatewayEvent.deleteMany({ where: { spaceId: ctx.space.id } });
  await cleanup([ctx.space.slug], ctx.domain);
});
afterEach(() => { vi.unstubAllGlobals(); });

async function owingLoan() {
  counter += 1;
  const item = await prisma.item.create({ data: { spaceId: ctx.space.id, sku: `WH-${counter}`, name: `Probe ${counter}`, qrCode: newQrCode("item"), lendable: true } });
  const loan = await prisma.loan.create({
    data: { spaceId: ctx.space.id, number: 3000 + counter, borrowerId: ctx.member.id, status: "APPROVED", dueAt: new Date(Date.now() + 7 * 864e5), lines: { create: [{ itemId: item.id, quantityRequested: 1, quantityApproved: 1 }] } },
  });
  await tx((client) => createLoanCharges(client, { loanId: loan.id }));
  return loan;
}

async function checkout(provider: "STRIPE" | "RAZORPAY", loanId: string) {
  const orderId = provider === "STRIPE" ? `cs_${suffix}_${++counter}` : `order_${suffix}_${++counter}`;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(provider === "STRIPE" ? { id: orderId, url: "https://checkout.stripe.com/c/pay/x" } : { id: orderId })));
  const started = await startCheckout({ spaceId: ctx.space.id, loanId, payerId: ctx.member.id, provider, customer: { name: "Member", email: ctx.member.email } });
  vi.unstubAllGlobals();
  return { ...started, orderId };
}

function post(provider: "stripe" | "razorpay", body: string, headers: Record<string, string>, path = code) {
  const request = new Request(`http://localhost/api/payments/${provider}/${path}`, { method: "POST", body, headers });
  return POST(request, { params: Promise.resolve({ provider, code: path }) });
}

function stripeEvent(id: string, type: string, object: Record<string, unknown>) {
  const body = JSON.stringify({ id, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  return { body, headers: { "stripe-signature": `t=${t},v1=${hmac("whsec_e2e", `${t}.${body}`)}` } };
}

function razorpayEvent(event: string, entity: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({ event, created_at: Math.floor(Date.now() / 1000), payload: { [entity]: { entity: payload } } });
  return { body, headers: { "x-razorpay-signature": hmac("rzp-hook", body) } };
}

describe("payment webhook route", () => {
  it("settles a Stripe checkout once and acknowledges the retry", async () => {
    const loan = await owingLoan();
    const started = await checkout("STRIPE", loan.id);
    expect(started.kind).toBe("redirect");
    const event = stripeEvent(`evt_${suffix}_1`, "checkout.session.completed", { id: started.orderId, payment_status: "paid", client_reference_id: started.paymentId, payment_intent: "pi_1", amount_total: 10_000, currency: "inr" });
    const first = await post("stripe", event.body, event.headers);
    expect([first.status, await first.text()]).toEqual([200, "OK"]);
    const again = await post("stripe", event.body, event.headers);
    expect([again.status, await again.text()]).toEqual([200, "Duplicate"]);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: started.paymentId } })).toMatchObject({ status: "PAID", gatewayPaymentId: "pi_1" });
    expect(await prisma.loanCharge.count({ where: { loanId: loan.id, status: "PAID" } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "payment.paid", targetId: started.paymentId } })).toBe(1);
  });

  it("refuses bad signatures, unknown codes and oversized bodies", async () => {
    const event = stripeEvent(`evt_${suffix}_bad`, "checkout.session.completed", { id: "cs_none", payment_status: "paid" });
    expect((await post("stripe", event.body, { "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}` })).status).toBe(401);
    expect((await post("stripe", event.body, event.headers, "unknown_space_code_123")).status).toBe(404);
    expect((await post("stripe", "x".repeat(257 * 1024), event.headers)).status).toBe(413);
    expect(await prisma.gatewayEvent.count({ where: { id: `${ctx.space.id}:evt_${suffix}_bad` } })).toBe(0);
  });

  it("settles a Razorpay capture and fails a declined attempt back to due", async () => {
    const loan = await owingLoan();
    const failedAttempt = await checkout("RAZORPAY", loan.id);
    expect(failedAttempt.kind).toBe("razorpay");
    const declined = razorpayEvent("payment.failed", "payment", { id: "pay_x", order_id: failedAttempt.orderId, notes: { paymentId: failedAttempt.paymentId }, error_description: "Card declined" });
    expect((await post("razorpay", declined.body, declined.headers)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: failedAttempt.paymentId } })).status).toBe("FAILED");
    expect(await prisma.loanCharge.count({ where: { loanId: loan.id, status: "DUE", paymentId: null } })).toBe(1);

    const attempt = await checkout("RAZORPAY", loan.id);
    const captured = razorpayEvent("payment.captured", "payment", { id: "pay_ok", order_id: attempt.orderId, amount: 10_000, currency: "INR", method: "upi", notes: { paymentId: attempt.paymentId } });
    expect((await post("razorpay", captured.body, captured.headers)).status).toBe(200);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: attempt.paymentId } })).toMatchObject({ status: "PAID", method: "upi" });
  });

  it("records a refund the provider processed", async () => {
    const loan = await owingLoan();
    const payment = await tx((client) => recordOfflinePayment(client, { spaceId: ctx.space.id, loanId: loan.id, method: "cash", reference: "", actorId: ctx.staff.id }));
    await prisma.payment.update({ where: { id: payment.id }, data: { provider: "STRIPE", gatewayPaymentId: "pi_ref" } });
    const refund = await prisma.refund.create({ data: { spaceId: ctx.space.id, paymentId: payment.id, amountMinor: 10_000, reason: "Deposit returned", gatewayRefundId: "re_1" } });
    const event = stripeEvent(`evt_${suffix}_refund`, "refund.updated", { id: "re_1", status: "succeeded", amount: 10_000, metadata: { refundId: refund.id } });
    expect((await post("stripe", event.body, event.headers)).status).toBe(200);
    expect((await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).status).toBe("PROCESSED");
    expect((await prisma.loanCharge.findFirstOrThrow({ where: { loanId: loan.id, kind: "DEPOSIT" } })).refundedMinor).toBe(10_000);
  });

  it("reconciles a pending gateway payment whose webhook never came", async () => {
    const loan = await owingLoan();
    const started = await checkout("STRIPE", loan.id);
    await prisma.payment.update({ where: { id: started.paymentId }, data: { createdAt: new Date(Date.now() - 20 * 60_000) } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: started.orderId, payment_status: "paid", status: "complete", client_reference_id: started.paymentId, payment_intent: "pi_rec", amount_total: 10_000, currency: "inr" })));
    const result = await reconcilePendingPayments(new Date());
    expect(result.settled).toBeGreaterThanOrEqual(1);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: started.paymentId } })).status).toBe("PAID");
  });
});
