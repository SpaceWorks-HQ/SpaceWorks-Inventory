import "server-only";

import type { ChargeKind, FinanceCategory, FinanceMethod, PaymentProvider } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { postFinanceEntry } from "./post";

/**
 * Posting rules per source. Each is called by the source's own workflow in
 * its transaction (lib/payments/settle.ts, lib/payments/refunds.ts,
 * lib/repairs/pay.ts, lib/purchases), and mirrors the backfill in the
 * 20261024150000_repairs_and_finance migration.
 */

/** Gateway payments by provider; offline ones by the method staff recorded. */
export function paymentMethod(provider: PaymentProvider, method: string | null): FinanceMethod {
  if (provider === "RAZORPAY") return "GATEWAY_RAZORPAY";
  if (provider === "STRIPE") return "GATEWAY_STRIPE";
  switch ((method ?? "").toLowerCase()) {
    case "cash": return "CASH";
    case "upi": return "UPI";
    case "bank_transfer": return "BANK_TRANSFER";
    default: return "OTHER";
  }
}

/** A payment for one kind of charge is filed under it; a mix is "Loan fees". */
export function paymentCategory(kinds: ChargeKind[]): FinanceCategory {
  const distinct = [...new Set(kinds)];
  return distinct.length === 1 ? distinct[0]! : "LOAN_FEES";
}

export async function postPaymentReceived(tx: Tx, paymentId: string) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { charges: { select: { kind: true } } } });
  if (payment.status !== "PAID" || payment.amountMinor <= 0) return null;
  return postFinanceEntry(tx, {
    spaceId: payment.spaceId,
    direction: "IN",
    category: paymentCategory(payment.charges.map((charge) => charge.kind)),
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: paymentMethod(payment.provider, payment.method),
    reference: payment.reference ?? payment.gatewayPaymentId,
    occurredAt: payment.paidAt ?? new Date(),
    source: { type: "Payment", id: payment.id },
    actorId: payment.recordedById,
  });
}

export async function postRefundProcessed(tx: Tx, refundId: string) {
  const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (refund.status !== "PROCESSED") return null;
  return postFinanceEntry(tx, {
    spaceId: refund.spaceId,
    direction: "OUT",
    category: refund.reason.startsWith("Deposit returned") ? "DEPOSIT_REFUND" : "REFUND",
    amountMinor: refund.amountMinor,
    currency: refund.payment.currency,
    method: paymentMethod(refund.payment.provider, refund.payment.method),
    reference: refund.gatewayRefundId,
    occurredAt: refund.processedAt ?? new Date(),
    source: { type: "Refund", id: refund.id },
    actorId: refund.createdById,
  });
}

export async function postRepairPayout(tx: Tx, payoutId: string) {
  const payout = await tx.repairPayout.findUniqueOrThrow({ where: { id: payoutId }, include: { issue: { select: { itemId: true, assetId: true } } } });
  return postFinanceEntry(tx, {
    spaceId: payout.spaceId,
    direction: "OUT",
    category: "REPAIR",
    amountMinor: payout.amountMinor,
    currency: payout.currency,
    method: payout.method,
    reference: payout.reference,
    occurredAt: payout.paidAt,
    source: { type: "RepairPayout", id: payout.id },
    actorId: payout.paidById,
    note: payout.note,
    itemId: payout.issue.itemId,
    assetId: payout.issue.assetId,
    technicianId: payout.technicianId,
  });
}

export async function postPurchasePaid(tx: Tx, purchaseId: string, actorId: string | null) {
  const purchase = await tx.purchaseItem.findUniqueOrThrow({ where: { id: purchaseId }, include: { space: { select: { currency: true } } } });
  if (!purchase.paidMinor || !purchase.paidMethod || !purchase.paidAt) return null;
  return postFinanceEntry(tx, {
    spaceId: purchase.spaceId,
    direction: "OUT",
    category: "PURCHASE",
    amountMinor: purchase.paidMinor,
    currency: purchase.space.currency,
    method: purchase.paidMethod,
    reference: purchase.paidReference,
    occurredAt: purchase.paidAt,
    source: { type: "PurchaseItem", id: purchase.id },
    actorId,
    note: purchase.name,
    itemId: purchase.itemId,
    supplierId: purchase.supplierId,
  });
}
