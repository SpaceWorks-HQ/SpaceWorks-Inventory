import "server-only";

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { loadGateway } from "./config";
import { GatewayError } from "./gateway";
import { lockPayment } from "./internal";
import { attachGatewayRefund, failRefund, processRefund, queueRefund } from "./refunds";

export type RefundOutcome = { status: "PENDING" | "PROCESSED" | "FAILED"; error?: string };

/**
 * Send a committed PENDING refund to its provider. Never runs inside a
 * database transaction. Offline refunds wait for staff to hand the cash
 * back. Once the provider has answered, only its answer fails a refund: a
 * timeout leaves it PENDING for the webhook or the reconcile job.
 */
export async function sendRefund(spaceId: string, refundId: string): Promise<RefundOutcome> {
  const refund = await prisma.refund.findFirst({ where: { id: refundId, spaceId }, include: { payment: true } });
  if (!refund) return { status: "FAILED", error: "That refund wasn't found." };
  if (refund.status !== "PENDING") return { status: refund.status };
  const provider = refund.payment.provider;
  if (provider === "OFFLINE") return { status: "PENDING" };
  const live = await loadGateway(spaceId, provider);
  if (!live || !refund.payment.gatewayPaymentId) {
    await prisma.$transaction((tx) => failRefund(tx, { spaceId, refundId, reason: "The payment provider isn't connected any more." }));
    return { status: "FAILED", error: "The payment provider isn't connected any more. Refund it from the provider's dashboard." };
  }
  let result: Awaited<ReturnType<typeof live.gateway.refund>>;
  try {
    // Look for an earlier attempt of this refund first (Razorpay has no idempotency key, Stripe's expire).
    const earlier = await live.gateway.fetchRefund(live.credentials, { gatewayPaymentId: refund.payment.gatewayPaymentId, gatewayRefundId: refund.gatewayRefundId, refundId });
    result = earlier ?? (await live.gateway.refund(live.credentials, { gatewayPaymentId: refund.payment.gatewayPaymentId, amountMinor: refund.amountMinor, currency: refund.payment.currency, refundId }));
  } catch (error) {
    if (!(error instanceof GatewayError) || error.retryable) return { status: "PENDING" };
    await prisma.$transaction((tx) => failRefund(tx, { spaceId, refundId, reason: "The payment provider refused the refund." }));
    return { status: "FAILED", error: "The payment provider refused the refund. Nothing was refunded." };
  }
  try {
    await prisma.$transaction(async (tx) => {
      if (result.gatewayRefundId) await attachGatewayRefund(tx, { spaceId, refundId, gatewayRefundId: result.gatewayRefundId });
      if (result.status === "processed") await processRefund(tx, { spaceId, refundId, gatewayRefundId: result.gatewayRefundId || null });
      if (result.status === "failed") await failRefund(tx, { spaceId, refundId, reason: "The payment provider declined the refund." });
    });
  } catch {
    console.error("[payments] recording a gateway refund failed; left pending");
    return { status: "PENDING" };
  }
  return { status: result.status === "processed" ? "PROCESSED" : result.status === "failed" ? "FAILED" : "PENDING" };
}

/** After the transaction that queued refunds commits (e.g. `cancelOpenCharges`). */
export async function processQueuedRefunds(spaceId: string, refundIds: string[]) {
  const outcomes: RefundOutcome[] = [];
  for (const id of refundIds) {
    try {
      outcomes.push(await sendRefund(spaceId, id));
    } catch {
      console.error("[payments] a queued refund could not be sent; the reconcile job will retry");
      outcomes.push({ status: "PENDING" });
    }
  }
  return outcomes;
}

/**
 * Staff act on a refund that didn't go through. A failed gateway refund is
 * tried again as a new refund (providers remember the old one's key); a
 * pending offline refund is recorded as handed back in cash.
 */
export async function retryRefund(spaceId: string, refundId: string, actorId: string): Promise<RefundOutcome> {
  const refund = await prisma.refund.findFirst({ where: { id: refundId, spaceId }, include: { payment: { select: { provider: true } } } });
  if (!refund) throw new DomainError("That refund wasn't found.", "not_found");
  if (refund.payment.provider === "OFFLINE") {
    if (refund.status === "PROCESSED") return { status: "PROCESSED" };
    if (refund.status === "PENDING") {
      await prisma.$transaction((tx) => processRefund(tx, { spaceId, refundId }));
      return { status: "PROCESSED" };
    }
    const cash = await prisma.$transaction((tx) => queueRefund(tx, { spaceId, paymentId: refund.paymentId, amountMinor: refund.amountMinor, reason: refund.reason, actorId, cash: true }));
    return { status: cash.status };
  }
  if (refund.status === "PENDING") return sendRefund(spaceId, refundId);
  if (refund.status !== "FAILED") return { status: refund.status };
  const again = await prisma.$transaction(async (tx) => {
    await lockPayment(tx, spaceId, refund.paymentId);
    const later = await tx.refund.count({ where: { paymentId: refund.paymentId, createdAt: { gt: refund.createdAt } } });
    if (later > 0) throw new DomainError("This refund was already tried again.", "conflict");
    return queueRefund(tx, { spaceId, paymentId: refund.paymentId, amountMinor: refund.amountMinor, reason: refund.reason, actorId });
  });
  return sendRefund(spaceId, again.id);
}
