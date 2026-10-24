import "server-only";

import type { ChargeKind } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { attachCharges, lockLoanRow, openPayLater, payableCharges } from "./internal";
import { queueRefund } from "./refunds";

/**
 * Promise to pay later for the loan's DUE charges (deposit and rental unless
 * `kinds` says otherwise). Reuses the loan's open pay-later payment when
 * there is one. Returns the amount now covered by the promise (0 when
 * nothing is due).
 */
export async function payLaterForLoan(tx: Tx, args: { loanId: string; payerId: string; kinds?: ChargeKind[]; actorId?: string | null }) {
  const lock = await lockLoanRow(tx, args.loanId);
  const kinds = args.kinds ?? ["DEPOSIT", "RENTAL"];
  const charges = (await payableCharges(tx, args.loanId, kinds)).filter((charge) => !(charge.payment?.payLater && charge.payment.status === "PENDING"));
  let promise = await openPayLater(tx, args.loanId);
  if (charges.length === 0) {
    return { amountMinor: promise ? await coveredBy(tx, promise.id) : 0, paymentId: promise?.id ?? null };
  }
  const currency = charges[0]!.currency;
  const sum = charges.reduce((total, charge) => total + charge.amountMinor, 0);
  if (!promise) {
    promise = await tx.payment.create({
      data: { spaceId: lock.spaceId, loanId: args.loanId, payerId: args.payerId, provider: "OFFLINE", status: "PENDING", payLater: true, amountMinor: Math.max(1, sum), currency, recordedById: args.actorId ?? null },
    });
  }
  await attachCharges(tx, charges.map((charge) => charge.id), promise.id);
  const amountMinor = await coveredBy(tx, promise.id);
  if (amountMinor > 0) await tx.payment.update({ where: { id: promise.id }, data: { amountMinor } });
  await recordAuditEvent({ client: tx, action: "payment.pay_later", spaceId: lock.spaceId, actorId: args.actorId ?? args.payerId, targetType: "Payment", targetId: promise.id, metadata: { loanId: args.loanId, amountMinor } });
  return { amountMinor, paymentId: promise.id };
}

async function coveredBy(tx: Tx, paymentId: string) {
  const sum = await tx.loanCharge.aggregate({ where: { paymentId, status: "DUE" }, _sum: { amountMinor: true } });
  return sum._sum.amountMinor ?? 0;
}

/** Keep a pay-later promise's amount in step with its charges; close it when none are left. */
async function resyncPayLater(tx: Tx, paymentId: string) {
  const amountMinor = await coveredBy(tx, paymentId);
  if (amountMinor > 0) await tx.payment.update({ where: { id: paymentId }, data: { amountMinor } });
  else await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "CANCELLED", note: "Nothing left to pay." } });
}

/**
 * Staff waive a DUE charge with a reason (also used when an incident is
 * resolved as waived). Refused while a gateway or offline payment for it is
 * in flight, so money and charges never disagree.
 */
export async function waiveCharge(tx: Tx, args: { spaceId: string; chargeId: string; reason: string; actorId: string | null }) {
  const reason = args.reason.trim();
  if (!reason) throw new DomainError("Give a reason for waiving this charge.");
  const found = await tx.loanCharge.findFirst({ where: { id: args.chargeId, spaceId: args.spaceId }, select: { loanId: true } });
  if (!found) throw new DomainError("That charge wasn't found.", "not_found");
  await lockLoanRow(tx, found.loanId, args.spaceId);
  const charge = await tx.loanCharge.findUniqueOrThrow({ where: { id: args.chargeId }, include: { payment: { select: { id: true, status: true, payLater: true } } } });
  if (charge.status !== "DUE") throw new DomainError("Only a charge that is still due can be waived.", "conflict");
  const payment = charge.payment;
  if (payment?.status === "AWAITING_CONFIRMATION") throw new DomainError("A payment for this charge is waiting for confirmation. Confirm or reject it first.", "conflict");
  if (payment?.status === "PENDING" && !payment.payLater) throw new DomainError("An online payment for this charge is in progress. Try again in a few minutes.", "conflict");
  await tx.loanCharge.update({ where: { id: charge.id }, data: { status: "WAIVED", waivedReason: reason.slice(0, 500), waivedById: args.actorId, paymentId: null } });
  if (payment?.payLater && payment.status === "PENDING") await resyncPayLater(tx, payment.id);
  await recordAuditEvent({ client: tx, action: "charge.waived", spaceId: args.spaceId, actorId: args.actorId, targetType: "LoanCharge", targetId: charge.id, metadata: { loanId: charge.loanId, kind: charge.kind, amountMinor: charge.amountMinor } });
  return tx.loanCharge.findUniqueOrThrow({ where: { id: charge.id } });
}

/**
 * The loan was rejected or cancelled before issue. DUE charges are
 * cancelled, open payment attempts closed, and paid deposit and rental are
 * queued for a full refund (status PENDING). The gateway is never called
 * here: after the transaction commits, pass `refundIds` to
 * `processQueuedRefunds` (the reconcile job also picks them up).
 */
export async function cancelOpenCharges(tx: Tx, args: { loanId: string; reason: string; actorId?: string | null }) {
  const lock = await lockLoanRow(tx, args.loanId);
  const reason = args.reason.trim() || "Loan cancelled";
  const cancelled = await tx.loanCharge.updateMany({ where: { loanId: args.loanId, status: "DUE" }, data: { status: "CANCELLED", paymentId: null } });
  await tx.payment.updateMany({ where: { loanId: args.loanId, status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } }, data: { status: "CANCELLED", note: "Closed: the loan was cancelled." } });
  const paid = await tx.loanCharge.findMany({ where: { loanId: args.loanId, status: "PAID", kind: { in: ["DEPOSIT", "RENTAL"] }, paymentId: { not: null } }, orderBy: { paymentId: "asc" } });
  const perPayment = new Map<string, number>();
  for (const charge of paid) perPayment.set(charge.paymentId!, (perPayment.get(charge.paymentId!) ?? 0) + charge.amountMinor - charge.refundedMinor);
  const refundIds: string[] = [];
  for (const [paymentId, owed] of perPayment) {
    const pending = await tx.refund.aggregate({ where: { paymentId, status: { in: ["PENDING", "PROCESSED"] } }, _sum: { amountMinor: true } });
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { amountMinor: true } });
    const amountMinor = Math.min(owed, payment.amountMinor - (pending._sum.amountMinor ?? 0));
    if (amountMinor <= 0) continue;
    const refund = await queueRefund(tx, { spaceId: lock.spaceId, paymentId, amountMinor, reason: `Loan cancelled: ${reason}`.slice(0, 300), actorId: args.actorId ?? null });
    refundIds.push(refund.id);
  }
  await recordAuditEvent({ client: tx, action: "charges.cancelled", spaceId: lock.spaceId, actorId: args.actorId ?? null, targetType: "Loan", targetId: args.loanId, metadata: { cancelled: cancelled.count, refunds: refundIds.length } });
  return { refundIds };
}
