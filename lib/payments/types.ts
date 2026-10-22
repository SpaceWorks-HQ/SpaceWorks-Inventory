import type { ChargeKind, ChargeStatus, PaymentProvider, PaymentStatus, RefundStatus } from "@prisma/client";

/** Payment view types and words (pure and client-safe). */

export const OFFLINE_METHODS = ["cash", "upi", "bank_transfer", "card", "other"] as const;
export type OfflineMethod = (typeof OFFLINE_METHODS)[number];

export const OFFLINE_METHOD_LABEL: Record<OfflineMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  card: "Card at the desk",
  other: "Other",
};

export const PROVIDER_LABEL: Record<PaymentProvider, string> = { RAZORPAY: "Razorpay", STRIPE: "Stripe", OFFLINE: "Offline" };

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";

export type ChargeView = {
  id: string;
  kind: ChargeKind;
  kindLabel: string;
  description: string;
  amountMinor: number;
  refundedMinor: number;
  status: ChargeStatus;
  /** "Paid", "Payment pending", "Due", "Waived", "Refunded ₹200"… */
  statusLabel: string;
  tone: Tone;
  waivedReason: string | null;
  paymentId: string | null;
  canWaive: boolean;
};

export type PaymentView = {
  id: string;
  provider: PaymentProvider;
  providerLabel: string;
  method: string | null;
  status: PaymentStatus;
  statusLabel: string;
  tone: Tone;
  amountMinor: number;
  reference: string | null;
  note: string | null;
  payLater: boolean;
  flagged: boolean;
  dateLabel: string;
  refundableMinor: number;
};

export type RefundView = {
  id: string;
  paymentId: string;
  provider: PaymentProvider;
  amountMinor: number;
  reason: string;
  status: RefundStatus;
  statusLabel: string;
  tone: Tone;
  failureReason: string | null;
  dateLabel: string;
  /** Staff can try a failed gateway refund again, or record a pending cash refund as handed back. */
  canRetry: boolean;
};

export type LoanPaymentSummary = {
  loanId: string;
  borrowerId: string;
  currency: string;
  charges: ChargeView[];
  payments: PaymentView[];
  refunds: RefundView[];
  totals: { dueMinor: number; paidMinor: number; payLaterMinor: number; awaitingMinor: number; refundableDepositMinor: number; refundedMinor: number };
  /** One word for the loan: "No charges", "Paid", "Payment pending", "Due". */
  headline: { label: string; tone: Tone };
  actions: {
    payNow: Array<"RAZORPAY" | "STRIPE">;
    payLater: boolean;
    submitOffline: boolean;
    recordOffline: boolean;
    markPayLater: boolean;
    confirmPaymentIds: string[];
    returnDeposit: { chargeId: string; maxMinor: number } | null;
    refundPaymentIds: string[];
  };
  offline: { enabled: boolean; instructions: string | null };
};

export type LoanPaymentViewer = "borrower" | "staff";
