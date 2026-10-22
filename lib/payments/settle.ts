import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import type { Tx } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { formatMoney } from "@/lib/format/money";
import { createNotifications } from "@/lib/notifications";
import { FLAG_PREFIX, loanBorrowerPath, lockPayment, releaseCharges } from "./internal";

export type Capture = { gatewayPaymentId: string | null; amountMinor: number; currency: string; method: string | null };

/**
 * Money arrived for a payment: mark it PAID exactly once and its DUE
 * charges PAID, in the caller's transaction. Surprises never refuse money:
 * a capture whose amount or currency differs from the payment is recorded
 * as PAID for the amount received, flagged in the note, and its charges are
 * released (still due) for staff to sort out. A capture on an attempt that
 * was already closed is flagged too. Idempotent: a PAID payment is returned
 * unchanged.
 */
export async function settlePayment(tx: Tx, args: { spaceId: string; paymentId: string; capture?: Capture; confirmedById?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const payment = await lockPayment(tx, args.spaceId, args.paymentId);
  if (payment.status === "PAID") return { payment, alreadySettled: true, flagged: payment.note?.startsWith(FLAG_PREFIX) ?? false };

  const capture = args.capture;
  const flags: string[] = [];
  const mismatch = Boolean(capture && (capture.amountMinor !== payment.amountMinor || capture.currency.toUpperCase() !== payment.currency.toUpperCase()));
  if (mismatch) flags.push(`Received ${formatMoney(capture!.amountMinor, capture!.currency.toUpperCase() || payment.currency)} but ${formatMoney(payment.amountMinor, payment.currency)} was due. Check it, then record the difference or refund.`);
  if (payment.status === "CANCELLED" || payment.status === "FAILED") flags.push("Paid after this attempt was closed. Check for a double payment and refund if needed.");
  const receivedMinor = mismatch && capture!.amountMinor > 0 && capture!.currency.toUpperCase() === payment.currency.toUpperCase() ? capture!.amountMinor : payment.amountMinor;

  if (mismatch) await releaseCharges(tx, payment);
  const charges = mismatch ? { count: 0 } : await tx.loanCharge.updateMany({ where: { paymentId: payment.id, status: "DUE" }, data: { status: "PAID" } });
  const updated = await tx.payment.update({
    where: { id: payment.id },
    data: {
      status: "PAID",
      paidAt: now,
      payLater: false,
      amountMinor: receivedMinor,
      gatewayPaymentId: capture?.gatewayPaymentId ?? payment.gatewayPaymentId,
      method: capture?.method ?? payment.method,
      recordedById: args.confirmedById ?? payment.recordedById,
      note: flags.length ? `${FLAG_PREFIX}${flags.join(" ")}`.slice(0, 1000) : payment.note,
    },
  });

  // A promise to pay later that has nothing left to cover is now moot.
  const promises = await tx.payment.findMany({ where: { loanId: payment.loanId, payLater: true, status: "PENDING", id: { not: payment.id } }, select: { id: true } });
  for (const promise of promises) {
    const due = await tx.loanCharge.count({ where: { paymentId: promise.id, status: "DUE" } });
    if (due === 0) await tx.payment.update({ where: { id: promise.id }, data: { status: "CANCELLED", note: "Paid another way." } });
  }

  const loan = await tx.loan.findUniqueOrThrow({ where: { id: payment.loanId }, select: { id: true, number: true, space: { select: { slug: true } } } });
  await recordAuditEvent({
    client: tx,
    action: "payment.paid",
    spaceId: args.spaceId,
    actorId: args.confirmedById ?? null,
    targetType: "Payment",
    targetId: payment.id,
    metadata: { loanId: loan.id, provider: payment.provider, amountMinor: receivedMinor, currency: payment.currency, charges: charges.count, flagged: flags.length > 0 },
  });
  await emitEvent(tx, {
    spaceId: args.spaceId,
    type: "payment.succeeded",
    data: { paymentId: payment.id, loanId: loan.id, reference: loanRef(loan.number), amountMinor: receivedMinor, currency: payment.currency, provider: payment.provider, flagged: flags.length > 0 },
  });
  await createNotifications([{
    userId: payment.payerId,
    spaceId: args.spaceId,
    kind: "payment.succeeded",
    title: `Payment of ${formatMoney(receivedMinor, payment.currency)} received for ${loanRef(loan.number)}`,
    body: flags.length ? "Staff will check it and be in touch if anything is off." : null,
    url: loanBorrowerPath(loan.space.slug, loan.id),
  }], { client: tx });
  return { payment: updated, alreadySettled: false, flagged: flags.length > 0 };
}

/**
 * A gateway attempt failed or expired, or staff rejected an offline
 * submission. Only an open attempt moves; its charges go back to the
 * pay-later promise or become plainly due again.
 */
export async function failPayment(tx: Tx, args: { spaceId: string; paymentId: string; reason: string; status?: "FAILED" | "CANCELLED"; actorId?: string | null }) {
  const payment = await lockPayment(tx, args.spaceId, args.paymentId);
  if (payment.status !== "PENDING" && payment.status !== "AWAITING_CONFIRMATION") return payment;
  if (payment.payLater) return payment;
  await releaseCharges(tx, payment);
  const updated = await tx.payment.update({ where: { id: payment.id }, data: { status: args.status ?? "FAILED", note: args.reason.slice(0, 300) } });
  await recordAuditEvent({ client: tx, action: args.status === "CANCELLED" ? "payment.rejected" : "payment.failed", spaceId: args.spaceId, actorId: args.actorId ?? null, targetType: "Payment", targetId: payment.id, metadata: { loanId: payment.loanId, provider: payment.provider } });
  return updated;
}
