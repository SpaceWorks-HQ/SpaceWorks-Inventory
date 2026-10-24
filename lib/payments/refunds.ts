import "server-only";

import type { ChargeKind } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { postRefundProcessed } from "@/lib/finance/sources";
import { formatMoney } from "@/lib/format/money";
import { createNotifications } from "@/lib/notifications";
import { loanRef } from "@/lib/catalogue/references";
import { loanBorrowerPath, lockLoanRow, lockPayment } from "./internal";

/**
 * Refund bookkeeping inside a transaction. Creating a refund never calls a
 * gateway: gateway refunds stay PENDING and `refundGateway.ts` sends them
 * after commit. A refund can never exceed what is left on its payment
 * (checked under the payment lock, and by CHECK constraints).
 */

/** Paid amount less refunds that are pending or processed. */
export async function refundableMinor(tx: Tx, payment: { id: string; amountMinor: number }) {
  const refunded = await tx.refund.aggregate({ where: { paymentId: payment.id, status: { in: ["PENDING", "PROCESSED"] } }, _sum: { amountMinor: true } });
  return payment.amountMinor - (refunded._sum.amountMinor ?? 0);
}

/**
 * Open a refund on a PAID payment. `cash: true` records money already handed
 * back for an offline payment and processes it at once.
 */
export async function queueRefund(tx: Tx, args: { spaceId: string; paymentId: string; amountMinor: number; reason: string; actorId: string | null; cash?: boolean }) {
  const payment = await lockPayment(tx, args.spaceId, args.paymentId);
  if (payment.status !== "PAID") throw new DomainError("Only a paid payment can be refunded.", "conflict");
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) throw new DomainError("Enter an amount to refund.");
  if (args.amountMinor > (await refundableMinor(tx, payment))) throw new DomainError("That's more than is left to refund on this payment.", "conflict");
  if (args.cash && payment.provider !== "OFFLINE") throw new DomainError("Refund online payments through their provider.");
  const refund = await tx.refund.create({
    data: { spaceId: args.spaceId, paymentId: payment.id, amountMinor: args.amountMinor, reason: args.reason.trim().slice(0, 300) || "Refund", createdById: args.actorId },
  });
  await recordAuditEvent({ client: tx, action: "refund.created", spaceId: args.spaceId, actorId: args.actorId, targetType: "Refund", targetId: refund.id, metadata: { paymentId: payment.id, amountMinor: refund.amountMinor, provider: payment.provider } });
  if (args.cash) return processRefund(tx, { spaceId: args.spaceId, refundId: refund.id });
  return refund;
}

async function lockRefund(tx: Tx, spaceId: string, refundId: string) {
  const found = await tx.refund.findFirst({ where: { id: refundId, spaceId }, select: { paymentId: true } });
  if (!found) throw new DomainError("That refund wasn't found.", "not_found");
  await lockPayment(tx, spaceId, found.paymentId);
  await tx.$queryRaw`SELECT "id" FROM "Refund" WHERE "id" = ${refundId} FOR UPDATE`;
  return tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
}

const ALLOCATION: ChargeKind[] = ["DEPOSIT", "RENTAL", "LATE_FEE", "DAMAGE", "LOSS"];

/**
 * The money went back: mark the refund PROCESSED and spread it over the
 * payment's paid charges (deposit first, then rental, then fees), so
 * `LoanCharge.refundedMinor` never exceeds a charge. Idempotent.
 */
export async function processRefund(tx: Tx, args: { spaceId: string; refundId: string; gatewayRefundId?: string | null; now?: Date }) {
  const refund = await lockRefund(tx, args.spaceId, args.refundId);
  if (refund.status === "PROCESSED") return refund;
  if (refund.status === "FAILED") throw new DomainError("This refund failed. Start a new one instead.", "conflict");
  const updated = await tx.refund.update({
    where: { id: refund.id },
    data: { status: "PROCESSED", processedAt: args.now ?? new Date(), gatewayRefundId: args.gatewayRefundId ?? refund.gatewayRefundId, failureReason: null },
    include: { payment: true },
  });
  const charges = await tx.loanCharge.findMany({ where: { paymentId: refund.paymentId, status: "PAID" } });
  charges.sort((a, b) => ALLOCATION.indexOf(a.kind) - ALLOCATION.indexOf(b.kind));
  let left = refund.amountMinor;
  for (const charge of charges) {
    const take = Math.min(left, charge.amountMinor - charge.refundedMinor);
    if (take <= 0) continue;
    await tx.loanCharge.update({ where: { id: charge.id }, data: { refundedMinor: { increment: take } } });
    left -= take;
    if (left === 0) break;
  }
  await postRefundProcessed(tx, refund.id);
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: refund.payment.loanId }, select: { id: true, number: true, space: { select: { slug: true } } } });
  await recordAuditEvent({ client: tx, action: "refund.processed", spaceId: args.spaceId, actorId: null, targetType: "Refund", targetId: refund.id, metadata: { paymentId: refund.paymentId, amountMinor: refund.amountMinor } });
  await emitEvent(tx, { spaceId: args.spaceId, type: "payment.refunded", data: { refundId: refund.id, paymentId: refund.paymentId, loanId: loan.id, amountMinor: refund.amountMinor, currency: refund.payment.currency, provider: refund.payment.provider } });
  await createNotifications([{
    userId: refund.payment.payerId,
    spaceId: args.spaceId,
    kind: "payment.refunded",
    title: `Refund of ${formatMoney(refund.amountMinor, refund.payment.currency)} for ${loanRef(loan.number)}`,
    body: refund.payment.provider === "OFFLINE" ? "Staff recorded the refund." : "It can take a few working days to reach your account.",
    url: loanBorrowerPath(loan.space.slug, loan.id),
  }], { client: tx });
  return updated;
}

/** The provider refused or reversed the refund. Only a PENDING refund moves. */
export async function failRefund(tx: Tx, args: { spaceId: string; refundId: string; reason: string }) {
  const refund = await lockRefund(tx, args.spaceId, args.refundId);
  if (refund.status !== "PENDING") return refund;
  await recordAuditEvent({ client: tx, action: "refund.failed", spaceId: args.spaceId, actorId: null, targetType: "Refund", targetId: refund.id, metadata: { paymentId: refund.paymentId } });
  return tx.refund.update({ where: { id: refund.id }, data: { status: "FAILED", failureReason: args.reason.slice(0, 300) }, include: { payment: true } });
}

/** Store the gateway's refund id once the API call answers (a webhook may already have settled it). */
export async function attachGatewayRefund(tx: Tx, args: { spaceId: string; refundId: string; gatewayRefundId: string }) {
  const refund = await lockRefund(tx, args.spaceId, args.refundId);
  if (refund.gatewayRefundId || !args.gatewayRefundId) return refund;
  return tx.refund.update({ where: { id: refund.id }, data: { gatewayRefundId: args.gatewayRefundId }, include: { payment: true } });
}

export type DepositReturnInput = { spaceId: string; loanId: string; deductionMinor: number; reason: string; actorId: string };

/**
 * Staff return the deposit after the loan is back: in full, or less a
 * deduction that needs a reason (kept on the charge as `waivedReason`).
 * Offline deposits are refunded in cash now; gateway deposits get a PENDING
 * refund to send after commit. Returns the refund, or null when the whole
 * deposit was kept.
 */
export async function returnDeposit(tx: Tx, args: DepositReturnInput) {
  await lockLoanRow(tx, args.loanId, args.spaceId);
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: args.loanId }, select: { status: true } });
  if (loan.status !== "RETURNED" && loan.status !== "CLOSED_WITH_ISSUE") throw new DomainError("Return the deposit once the loan is back.", "conflict");
  const deposit = await tx.loanCharge.findFirst({ where: { loanId: args.loanId, kind: "DEPOSIT", status: "PAID", payment: { status: "PAID" } }, include: { payment: true } });
  if (!deposit?.payment) throw new DomainError("There's no paid deposit on this loan.", "conflict");
  if (deposit.waivedById) throw new DomainError("This deposit was already settled.", "conflict");
  const pending = await tx.refund.aggregate({ where: { paymentId: deposit.payment.id, status: "PENDING" }, _sum: { amountMinor: true } });
  const remaining = deposit.amountMinor - deposit.refundedMinor - (pending._sum.amountMinor ?? 0);
  if (remaining <= 0) throw new DomainError("This deposit was already returned.", "conflict");
  if (!Number.isInteger(args.deductionMinor) || args.deductionMinor < 0) throw new DomainError("Enter the amount to keep, or 0.");
  if (args.deductionMinor > remaining) throw new DomainError(`You can keep at most ${formatMoney(remaining, deposit.currency)}.`);
  const reason = args.reason.trim();
  if (args.deductionMinor > 0 && !reason) throw new DomainError("Say why part of the deposit is kept.");
  if (args.deductionMinor > 0) {
    await tx.loanCharge.update({ where: { id: deposit.id }, data: { waivedReason: reason.slice(0, 500), waivedById: args.actorId } });
  }
  const refundMinor = remaining - args.deductionMinor;
  await recordAuditEvent({ client: tx, action: "deposit.returned", spaceId: args.spaceId, actorId: args.actorId, targetType: "LoanCharge", targetId: deposit.id, metadata: { loanId: args.loanId, refundMinor, deductionMinor: args.deductionMinor } });
  if (refundMinor <= 0) return null;
  return queueRefund(tx, {
    spaceId: args.spaceId,
    paymentId: deposit.payment.id,
    amountMinor: refundMinor,
    reason: args.deductionMinor > 0 ? `Deposit returned less ${formatMoney(args.deductionMinor, deposit.currency)}: ${reason}` : "Deposit returned",
    actorId: args.actorId,
    cash: deposit.payment.provider === "OFFLINE",
  });
}
