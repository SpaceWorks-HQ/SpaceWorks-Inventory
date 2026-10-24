import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const seen = new Set<string>();
const settlePayment = vi.fn();
const tx = {
  gatewayEvent: {
    createMany: vi.fn(async ({ data }: { data: Array<{ id: string }> }) => {
      const fresh = data.filter((row) => !seen.has(row.id));
      fresh.forEach((row) => seen.add(row.id));
      return { count: fresh.length };
    }),
  },
  payment: { findFirst: vi.fn(async () => ({ id: "pay-row" })) },
  refund: { findFirst: vi.fn(async () => null) },
  auditEvent: { create: vi.fn() },
};

vi.mock("@/lib/db", () => ({ prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) } }));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/payments/settle", () => ({ settlePayment: (...args: unknown[]) => settlePayment(...args), failPayment: vi.fn() }));
vi.mock("@/lib/payments/refunds", () => ({ processRefund: vi.fn(), failRefund: vi.fn() }));
vi.mock("@/lib/payments/config", async () => {
  const { stripe } = await import("@/lib/payments/stripe");
  const { razorpay } = await import("@/lib/payments/razorpay");
  return {
    GATEWAYS: { STRIPE: stripe, RAZORPAY: razorpay },
    findConfigByWebhookCode: async (code: string) => (code === "space_code_0123456789" ? { spaceId: "space-1" } : null),
    credentialsFor: () => ({ keyId: null, secret: "sk_test_x", webhookSecret: "whsec_unit", testMode: true }),
  };
});

const { handleWebhook } = await import("@/lib/payments/webhooks");
const { readCapped, webhookResponse } = await import("@/lib/payments/webhookRoute");

const raw = JSON.stringify({ id: "evt_dedupe", type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "paid", client_reference_id: "p1", payment_intent: "pi_1", amount_total: 5000, currency: "inr" } } });
function signed(body = raw) {
  const t = Math.floor(Date.now() / 1000);
  return new Headers({ "stripe-signature": `t=${t},v1=${crypto.createHmac("sha256", "whsec_unit").update(`${t}.${body}`).digest("hex")}` });
}

beforeEach(() => {
  seen.clear();
  settlePayment.mockReset();
});

describe("payment webhook handler", () => {
  it("applies an event once and acknowledges duplicates", async () => {
    expect(await handleWebhook("STRIPE", "space_code_0123456789", raw, signed())).toEqual({ status: 200, body: "OK" });
    expect(await handleWebhook("STRIPE", "space_code_0123456789", raw, signed())).toEqual({ status: 200, body: "Duplicate" });
    expect(settlePayment).toHaveBeenCalledTimes(1);
    expect(settlePayment.mock.calls[0]![1]).toMatchObject({ spaceId: "space-1", paymentId: "pay-row", capture: { amountMinor: 5000, currency: "INR" } });
    expect([...seen]).toEqual(["space-1:evt_dedupe"]);
  });

  it("answers 401 for a bad signature, 404 for an unknown code and 400 for a bad body", async () => {
    expect((await handleWebhook("STRIPE", "space_code_0123456789", raw, new Headers({ "stripe-signature": "t=1,v1=00" }))).status).toBe(401);
    expect((await handleWebhook("STRIPE", "unknown_code_0123456789", raw, signed())).status).toBe(404);
    expect((await handleWebhook("STRIPE", "space_code_0123456789", "not json", signed("not json"))).status).toBe(400);
    expect(settlePayment).not.toHaveBeenCalled();
  });

  it("acknowledges events it doesn't handle without recording them", async () => {
    const ignored = JSON.stringify({ id: "evt_other", type: "customer.created", data: { object: {} } });
    expect(await handleWebhook("STRIPE", "space_code_0123456789", ignored, signed(ignored))).toEqual({ status: 200, body: "Ignored" });
    expect(seen.size).toBe(0);
  });

  it("answers 503 when applying fails for infrastructure reasons, so the provider retries", async () => {
    settlePayment.mockRejectedValueOnce(new Error("connection reset"));
    const request = new Request("http://localhost/api/payments/stripe/space_code_0123456789", { method: "POST", body: raw, headers: signed() });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await webhookResponse("stripe", "space_code_0123456789", request)).status).toBe(503);
    errors.mockRestore();
  });

  it("caps the body at 256 KB and refuses unknown providers", async () => {
    const big = new Request("http://localhost/x", { method: "POST", body: "x".repeat(256 * 1024 + 1) });
    expect(await readCapped(big, 256 * 1024)).toBeNull();
    expect((await webhookResponse("stripe", "space_code_0123456789", new Request("http://localhost/x", { method: "POST", body: "x".repeat(300 * 1024) }))).status).toBe(413);
    expect((await webhookResponse("paypal", "space_code_0123456789", new Request("http://localhost/x", { method: "POST", body: "{}" }))).status).toBe(404);
  });
});
