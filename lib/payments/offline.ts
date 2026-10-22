import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { attachCharges, lockLoanRow, lockPayment, payableCharges } from "./internal";
import { failPayment, settlePayment } from "./settle";
import type { OfflineMethod } from "./types";

type OfflineInput = { spaceId: string; loanId: string; method: OfflineMethod; reference: string; note?: string };

async function newOfflinePayment(tx: Tx, input: OfflineInput & { payerId: string; status: "PENDING" | "AWAITING_CONFIRMATION"; recordedById: string | null }) {
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { currency: true } });
  const charges = (await payableCharges(tx, input.loanId)).filter((charge) => charge.currency === space.currency);
  const amountMinor = charges.reduce((sum, charge) => sum + charge.amountMinor, 0);
  if (amountMinor <= 0) throw new DomainError("Nothing is due on this loan.", "conflict");
  const payment = await tx.payment.create({
    data: {
      spaceId: input.spaceId,
      loanId: input.loanId,
      payerId: input.payerId,
      provider: "OFFLINE",
      status: input.status,
      method: input.method,
      amountMinor,
      currency: space.currency,
      reference: input.reference.trim().slice(0, 120) || null,
      note: input.note?.trim().slice(0, 500) || null,
      recordedById: input.recordedById,
    },
  });
  await attachCharges(tx, charges.map((charge) => charge.id), payment.id);
  return payment;
}

/**
 * A borrower says they paid by cash, UPI or bank transfer. The payment waits
 * for staff to confirm receipt (AWAITING_CONFIRMATION); until then it does
 * not count for issue.
 */
export async function submitOfflinePayment(tx: Tx, input: OfflineInput & { payerId: string }) {
  await lockLoanRow(tx, input.loanId, input.spaceId);
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: input.loanId }, select: { borrowerId: true } });
  if (loan.borrowerId !== input.payerId) throw new DomainError("That loan wasn't found.", "not_found");
  const config = await tx.spacePaymentConfig.findUnique({ where: { spaceId: input.spaceId }, select: { offlineEnabled: true } });
  if (config && !config.offlineEnabled) throw new DomainError("This space doesn't take offline payments. Pay online instead.", "conflict");
  if (!input.reference.trim() && input.method !== "cash") throw new DomainError("Add the transaction reference so staff can match it.");
  const payment = await newOfflinePayment(tx, { ...input, status: "AWAITING_CONFIRMATION", recordedById: null });
  await recordAuditEvent({ client: tx, action: "payment.submitted", spaceId: input.spaceId, actorId: input.payerId, targetType: "Payment", targetId: payment.id, metadata: { loanId: input.loanId, method: input.method, amountMinor: payment.amountMinor } });
  return payment;
}

/** Staff took money at the desk: a PAID offline payment for everything due on the loan. */
export async function recordOfflinePayment(tx: Tx, input: OfflineInput & { actorId: string }) {
  await lockLoanRow(tx, input.loanId, input.spaceId);
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: input.loanId }, select: { borrowerId: true } });
  const payment = await newOfflinePayment(tx, { ...input, payerId: loan.borrowerId, status: "PENDING", recordedById: input.actorId });
  await recordAuditEvent({ client: tx, action: "payment.recorded", spaceId: input.spaceId, actorId: input.actorId, targetType: "Payment", targetId: payment.id, metadata: { loanId: input.loanId, method: input.method, amountMinor: payment.amountMinor } });
  return (await settlePayment(tx, { spaceId: input.spaceId, paymentId: payment.id, confirmedById: input.actorId })).payment;
}

/** Staff confirm (PAID) or reject (CANCELLED, charges due again) a borrower's offline payment. */
export async function reviewOfflinePayment(tx: Tx, input: { spaceId: string; paymentId: string; decision: "confirm" | "reject"; reason?: string; actorId: string }) {
  const payment = await lockPayment(tx, input.spaceId, input.paymentId);
  if (payment.provider !== "OFFLINE" || payment.status !== "AWAITING_CONFIRMATION") throw new DomainError("That payment isn't waiting for confirmation.", "conflict");
  if (input.decision === "confirm") return (await settlePayment(tx, { spaceId: input.spaceId, paymentId: payment.id, confirmedById: input.actorId })).payment;
  return failPayment(tx, { spaceId: input.spaceId, paymentId: payment.id, status: "CANCELLED", reason: `Not received: ${input.reason?.trim() || "staff couldn't match it"}`, actorId: input.actorId });
}
