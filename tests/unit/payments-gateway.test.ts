import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import type { GatewayCredentials } from "@/lib/payments/gateway";
import { razorpay, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { stripe } from "@/lib/payments/stripe";

const hmac = (secret: string, value: string) => crypto.createHmac("sha256", secret).update(value).digest("hex");
const credentials: GatewayCredentials = { keyId: "rzp_test_abc", secret: "key-secret", webhookSecret: "whsec_test_secret", testMode: true };
const now = new Date("2026-10-23T10:00:00Z");
const nowSeconds = Math.floor(now.getTime() / 1000);

describe("Razorpay webhook signatures", () => {
  const body = (createdAt: number) => JSON.stringify({ event: "payment.captured", created_at: createdAt, payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 5000, currency: "INR", notes: { paymentId: "p1" } } } } });
  const signed = (raw: string, secret = credentials.webhookSecret!) => new Headers({ "x-razorpay-signature": hmac(secret, raw) });

  it("accepts a correctly signed, recent body", () => {
    const raw = body(nowSeconds - 60);
    expect(razorpay.verifyWebhook(credentials, raw, signed(raw), now)).toBe(true);
  });

  it("refuses a tampered body or the wrong secret", () => {
    const raw = body(nowSeconds - 60);
    expect(razorpay.verifyWebhook(credentials, raw.replace("5000", "1"), signed(raw), now)).toBe(false);
    expect(razorpay.verifyWebhook(credentials, raw, signed(raw, "other-secret"), now)).toBe(false);
    expect(razorpay.verifyWebhook(credentials, raw, new Headers(), now)).toBe(false);
    expect(razorpay.verifyWebhook({ ...credentials, webhookSecret: null }, raw, signed(raw), now)).toBe(false);
  });

  it("refuses a replayed body older than the retry window", () => {
    const raw = body(nowSeconds - 3 * 24 * 3600);
    expect(razorpay.verifyWebhook(credentials, raw, signed(raw), now)).toBe(false);
  });

  it("parses a capture with a stable event id", () => {
    const raw = body(nowSeconds);
    const event = razorpay.parseEvent(raw, new Headers());
    expect(event).toMatchObject({ type: "captured", orderId: "order_1", paymentId: "p1", gatewayPaymentId: "pay_1", amountMinor: 5000, currency: "INR" });
    expect(razorpay.parseEvent(raw, new Headers()).eventId).toBe(event.eventId);
  });

  it("checks the Checkout.js handler signature", () => {
    const signature = hmac("key-secret", "order_1|pay_1");
    expect(verifyCheckoutSignature("key-secret", "order_1", "pay_1", signature)).toBe(true);
    expect(verifyCheckoutSignature("key-secret", "order_1", "pay_2", signature)).toBe(false);
  });
});

describe("Stripe webhook signatures", () => {
  const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "p1", payment_intent: "pi_1", amount_total: 5000, currency: "inr" } } });
  const header = (timestamp: number, payload = raw, secret = credentials.webhookSecret!) => new Headers({ "stripe-signature": `t=${timestamp},v1=${hmac(secret, `${timestamp}.${payload}`)}` });

  it("accepts a correctly signed, fresh event", () => {
    expect(stripe.verifyWebhook(credentials, raw, header(nowSeconds - 30), now)).toBe(true);
  });

  it("refuses a tampered body or the wrong secret", () => {
    expect(stripe.verifyWebhook(credentials, raw.replace("5000", "1"), header(nowSeconds), now)).toBe(false);
    expect(stripe.verifyWebhook(credentials, raw, header(nowSeconds, raw, "whsec_other"), now)).toBe(false);
    expect(stripe.verifyWebhook(credentials, raw, new Headers({ "stripe-signature": "garbage" }), now)).toBe(false);
  });

  it("refuses a replayed event outside the five-minute tolerance", () => {
    expect(stripe.verifyWebhook(credentials, raw, header(nowSeconds - 600), now)).toBe(false);
    expect(stripe.verifyWebhook(credentials, raw, header(nowSeconds + 600), now)).toBe(false);
  });

  it("parses a paid checkout session", () => {
    expect(stripe.parseEvent(raw, new Headers())).toMatchObject({ type: "captured", eventId: "evt_1", orderId: "cs_1", paymentId: "p1", gatewayPaymentId: "pi_1", amountMinor: 5000, currency: "INR" });
  });
});
