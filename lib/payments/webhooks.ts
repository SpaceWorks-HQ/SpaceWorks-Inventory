import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { prisma, type Tx } from "@/lib/db";
import { credentialsFor, findConfigByWebhookCode, GATEWAYS, type GatewayProvider } from "./config";
import type { GatewayEvent } from "./gateway";
import { failRefund, processRefund } from "./refunds";
import { failPayment, settlePayment } from "./settle";

export type WebhookOutcome = { status: number; body: string };

async function findPayment(tx: Tx, spaceId: string, provider: GatewayProvider, paymentId: string | null, orderId: string | null) {
  if (paymentId) {
    const byId = await tx.payment.findFirst({ where: { id: paymentId, spaceId, provider }, select: { id: true } });
    if (byId) return byId;
  }
  return orderId ? tx.payment.findFirst({ where: { spaceId, provider, gatewayOrderId: orderId }, select: { id: true } }) : null;
}

async function findRefund(tx: Tx, spaceId: string, refundId: string | null, gatewayRefundId: string) {
  if (refundId) {
    const byId = await tx.refund.findFirst({ where: { id: refundId, spaceId }, select: { id: true, status: true } });
    if (byId) return byId;
  }
  return gatewayRefundId ? tx.refund.findFirst({ where: { spaceId, gatewayRefundId }, select: { id: true, status: true } }) : null;
}

async function unmatched(tx: Tx, spaceId: string, provider: GatewayProvider, event: GatewayEvent) {
  await recordAuditEvent({ client: tx, action: "payment.webhook_unmatched", spaceId, actorId: null, targetType: "GatewayEvent", targetId: event.eventId.slice(0, 120), metadata: { provider, type: event.type }, ip: null });
}

async function apply(tx: Tx, spaceId: string, provider: GatewayProvider, event: GatewayEvent) {
  switch (event.type) {
    case "captured": {
      const payment = await findPayment(tx, spaceId, provider, event.paymentId, event.orderId);
      if (!payment) return unmatched(tx, spaceId, provider, event);
      await settlePayment(tx, { spaceId, paymentId: payment.id, capture: { gatewayPaymentId: event.gatewayPaymentId, amountMinor: event.amountMinor, currency: event.currency, method: event.method } });
      return;
    }
    case "failed": {
      const payment = await findPayment(tx, spaceId, provider, event.paymentId, event.orderId);
      if (payment) await failPayment(tx, { spaceId, paymentId: payment.id, reason: event.reason });
      return;
    }
    case "refund-processed": {
      const refund = await findRefund(tx, spaceId, event.refundId, event.gatewayRefundId);
      // A refund we closed as failed that the provider later completed: flag it for staff, never 5xx.
      if (!refund || refund.status === "FAILED") return unmatched(tx, spaceId, provider, event);
      await processRefund(tx, { spaceId, refundId: refund.id, gatewayRefundId: event.gatewayRefundId || null });
      return;
    }
    case "refund-failed": {
      const refund = await findRefund(tx, spaceId, event.refundId, event.gatewayRefundId);
      if (refund) await failRefund(tx, { spaceId, refundId: refund.id, reason: event.reason });
      return;
    }
    case "ignored":
      return;
  }
}

/**
 * Verify and apply one provider webhook for the space behind `code`.
 * Business outcomes answer 200 (a mismatched or late payment is recorded and
 * flagged, never refused); a bad signature 401, a bad body 400, an unknown
 * code 404. Only infrastructure errors escape, so the route answers 5xx and
 * the provider retries. Each event applies once (GatewayEvent, keyed by
 * space and provider event id).
 */
export async function handleWebhook(provider: GatewayProvider, code: string, rawBody: string, headers: Headers, now = new Date()): Promise<WebhookOutcome> {
  const config = await findConfigByWebhookCode(code);
  if (!config) return { status: 404, body: "Not found" };
  const forced = { ...config, razorpayEnabled: true, stripeEnabled: true };
  const credentials = credentialsFor(forced, provider);
  const gateway = GATEWAYS[provider];
  if (!credentials || !gateway.verifyWebhook(credentials, rawBody, headers, now)) return { status: 401, body: "Invalid signature" };

  let event: GatewayEvent;
  try {
    event = gateway.parseEvent(rawBody, headers);
  } catch {
    return { status: 400, body: "Invalid payload" };
  }
  if (event.type === "ignored" || !event.eventId) return { status: 200, body: "Ignored" };

  const spaceId = config.spaceId;
  const applied = await prisma.$transaction(async (tx) => {
    const fresh = await tx.gatewayEvent.createMany({ data: [{ id: `${spaceId}:${event.eventId}`.slice(0, 250), provider, spaceId }], skipDuplicates: true });
    if (fresh.count === 0) return false;
    try {
      await apply(tx, spaceId, provider, event);
    } catch (error) {
      // A business refusal (e.g. a refund already closed) is still an answered event.
      if (error instanceof Error && error.name === "DomainError") {
        await unmatched(tx, spaceId, provider, event);
        return true;
      }
      throw error;
    }
    return true;
  });
  return { status: 200, body: applied ? "OK" : "Duplicate" };
}
