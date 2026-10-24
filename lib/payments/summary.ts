import "server-only";

import type { LoanCharge, Payment, Refund } from "@prisma/client";
import type { DbClient } from "@/lib/db";
import { formatDate } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { enabledProviders, gatewayTakes } from "./config";
import { CHARGE_KIND_LABEL } from "./fees";
import { FLAG_PREFIX } from "./internal";
import { PROVIDER_LABEL, type ChargeView, type LoanPaymentSummary, type PaymentView, type RefundView, type Tone } from "./types";

const PAYMENT_WORD: Record<Payment["status"], [string, Tone]> = {
  PENDING: ["In progress", "info"],
  AWAITING_CONFIRMATION: ["Awaiting confirmation", "warning"],
  PAID: ["Paid", "success"],
  FAILED: ["Failed", "danger"],
  CANCELLED: ["Cancelled", "neutral"],
};

const REFUND_WORD: Record<Refund["status"], [string, Tone]> = { PENDING: ["Refund pending", "info"], PROCESSED: ["Refunded", "success"], FAILED: ["Refund failed", "danger"] };

function chargeWord(charge: LoanCharge, payment: Payment | undefined, currency: string): [string, Tone] {
  if (charge.status === "WAIVED") return ["Waived", "neutral"];
  if (charge.status === "CANCELLED") return ["Cancelled", "neutral"];
  if (charge.status === "PAID") {
    if (charge.refundedMinor >= charge.amountMinor) return ["Refunded", "info"];
    if (charge.refundedMinor > 0) return [`Refunded ${formatMoney(charge.refundedMinor, currency)}`, "info"];
    if (charge.kind === "DEPOSIT" && charge.waivedById) return ["Kept", "neutral"];
    return ["Paid", "success"];
  }
  if (payment?.status === "AWAITING_CONFIRMATION") return ["Awaiting confirmation", "warning"];
  if (payment?.status === "PENDING" && payment.payLater) return ["Payment pending", "info"];
  if (payment?.status === "PENDING") return ["Payment in progress", "info"];
  return ["Due", "warning"];
}

/**
 * Everything the loan pages show about money: each charge, payment and
 * refund with its status word, totals, and which actions apply. The caller
 * has already checked the loan belongs to the viewer's space.
 */
export async function loanPaymentSummary(client: DbClient, loanId: string): Promise<LoanPaymentSummary> {
  const loan = await client.loan.findUniqueOrThrow({
    where: { id: loanId },
    select: {
      id: true,
      status: true,
      borrowerId: true,
      space: { select: { currency: true, timezone: true, payLaterEnabled: true, paymentConfig: true } },
      charges: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { refunds: { orderBy: { createdAt: "asc" } } } },
    },
  });
  const { currency, timezone } = loan.space;
  const config = loan.space.paymentConfig;
  const byId = new Map(loan.payments.map((payment) => [payment.id, payment]));
  const refunds = loan.payments.flatMap((payment) => payment.refunds);
  const live = (status: Refund["status"]) => status === "PENDING" || status === "PROCESSED";

  const charges: ChargeView[] = loan.charges.map((charge) => {
    const payment = charge.paymentId ? byId.get(charge.paymentId) : undefined;
    const [statusLabel, tone] = chargeWord(charge, payment, charge.currency);
    const busy = payment?.status === "AWAITING_CONFIRMATION" || (payment?.status === "PENDING" && !payment.payLater);
    return {
      id: charge.id,
      kind: charge.kind,
      kindLabel: CHARGE_KIND_LABEL[charge.kind],
      description: charge.description,
      amountMinor: charge.amountMinor,
      refundedMinor: charge.refundedMinor,
      status: charge.status,
      statusLabel,
      tone,
      waivedReason: charge.waivedReason,
      paymentId: charge.paymentId,
      canWaive: charge.status === "DUE" && !busy,
    };
  });

  const payments: PaymentView[] = loan.payments
    .filter((payment) => !(payment.payLater && payment.status === "CANCELLED"))
    .map((payment) => {
      const [statusLabel, tone] = payment.payLater && payment.status === "PENDING" ? ["Payment pending", "info" as Tone] : PAYMENT_WORD[payment.status];
      const refunded = payment.refunds.filter((refund) => live(refund.status)).reduce((sum, refund) => sum + refund.amountMinor, 0);
      return {
        id: payment.id,
        provider: payment.provider,
        providerLabel: payment.payLater && payment.status !== "PAID" ? "Pay later" : PROVIDER_LABEL[payment.provider],
        method: payment.method,
        status: payment.status,
        statusLabel,
        tone,
        amountMinor: payment.amountMinor,
        reference: payment.reference,
        note: payment.note,
        payLater: payment.payLater,
        flagged: payment.note?.startsWith(FLAG_PREFIX) ?? false,
        dateLabel: formatDate(payment.paidAt ?? payment.createdAt, timezone),
        refundableMinor: payment.status === "PAID" ? payment.amountMinor - refunded : 0,
      };
    });

  const refundViews: RefundView[] = refunds.map((refund) => {
    const payment = byId.get(refund.paymentId)!;
    const later = refunds.some((other) => other.paymentId === refund.paymentId && other.createdAt > refund.createdAt);
    const [statusLabel, tone] = REFUND_WORD[refund.status];
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      provider: payment.provider,
      amountMinor: refund.amountMinor,
      reason: refund.reason,
      status: refund.status,
      statusLabel,
      tone,
      failureReason: refund.failureReason,
      dateLabel: formatDate(refund.processedAt ?? refund.createdAt, timezone),
      canRetry: payment.provider === "OFFLINE" ? refund.status === "PENDING" : refund.status === "FAILED" && !later,
    };
  });

  const due = loan.charges.filter((charge) => charge.status === "DUE");
  const sumOf = (rows: LoanCharge[]) => rows.reduce((sum, charge) => sum + charge.amountMinor, 0);
  const paymentOf = (charge: LoanCharge) => (charge.paymentId ? byId.get(charge.paymentId) : undefined);
  const payLaterRows = due.filter((charge) => paymentOf(charge)?.payLater && paymentOf(charge)?.status === "PENDING");
  const awaitingRows = due.filter((charge) => paymentOf(charge)?.status === "AWAITING_CONFIRMATION");
  const payable = due.filter((charge) => paymentOf(charge)?.status !== "AWAITING_CONFIRMATION");
  const notPromised = payable.filter((charge) => !payLaterRows.includes(charge));

  const deposit = loan.charges.find((charge) => charge.kind === "DEPOSIT" && charge.status === "PAID" && paymentOf(charge)?.status === "PAID");
  const depositPending = deposit ? refunds.filter((refund) => refund.paymentId === deposit.paymentId && refund.status === "PENDING").reduce((sum, refund) => sum + refund.amountMinor, 0) : 0;
  const refundableDepositMinor = deposit && !deposit.waivedById ? Math.max(0, deposit.amountMinor - deposit.refundedMinor - depositPending) : 0;
  const returned = loan.status === "RETURNED" || loan.status === "CLOSED_WITH_ISSUE";

  const totals = {
    dueMinor: sumOf(due) - sumOf(payLaterRows) - sumOf(awaitingRows),
    paidMinor: loan.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + payment.amountMinor, 0),
    payLaterMinor: sumOf(payLaterRows),
    awaitingMinor: sumOf(awaitingRows),
    refundableDepositMinor,
    refundedMinor: refunds.filter((refund) => refund.status === "PROCESSED").reduce((sum, refund) => sum + refund.amountMinor, 0),
  };
  const headline: LoanPaymentSummary["headline"] =
    loan.charges.length === 0 ? { label: "No charges", tone: "neutral" }
      : totals.dueMinor > 0 ? { label: "Due", tone: "warning" }
        : totals.payLaterMinor + totals.awaitingMinor > 0 ? { label: "Payment pending", tone: "info" }
          : { label: "Paid", tone: "success" };
  const offlineEnabled = config?.offlineEnabled ?? true;

  return {
    loanId: loan.id,
    borrowerId: loan.borrowerId,
    currency,
    charges,
    payments,
    refunds: refundViews,
    totals,
    headline,
    actions: {
      payNow: payable.length ? enabledProviders(config).filter((provider) => gatewayTakes(provider, currency)) : [],
      payLater: loan.space.payLaterEnabled && notPromised.length > 0,
      markPayLater: notPromised.length > 0,
      submitOffline: offlineEnabled && payable.length > 0,
      recordOffline: payable.length > 0,
      confirmPaymentIds: loan.payments.filter((payment) => payment.status === "AWAITING_CONFIRMATION").map((payment) => payment.id),
      returnDeposit: returned && deposit && refundableDepositMinor > 0 ? { chargeId: deposit.id, maxMinor: refundableDepositMinor } : null,
      refundPaymentIds: payments.filter((payment) => payment.flagged && payment.refundableMinor > 0).map((payment) => payment.id),
    },
    offline: { enabled: offlineEnabled, instructions: config?.offlineInstructions ?? null },
  };
}
