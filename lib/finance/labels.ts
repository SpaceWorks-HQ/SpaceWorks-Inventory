import type { FinanceCategory, FinanceDirection, FinanceMethod, PayoutMethod } from "@prisma/client";

/** Finance words (pure and client-safe). */

export const CATEGORY_LABEL: Record<FinanceCategory, string> = {
  LOAN_FEES: "Loan fees",
  DEPOSIT: "Deposits",
  RENTAL: "Rental",
  LATE_FEE: "Late fees",
  DAMAGE: "Damage charges",
  LOSS: "Loss charges",
  REFUND: "Refunds",
  DEPOSIT_REFUND: "Deposits returned",
  REPAIR: "Repairs",
  PURCHASE: "Purchases",
  RENT: "Rent",
  UTILITIES: "Utilities",
  SUPPLIES: "Supplies",
  OTHER_INCOME: "Other income",
  OTHER_EXPENSE: "Other expenses",
};

export const METHOD_LABEL: Record<FinanceMethod, string> = {
  GATEWAY_RAZORPAY: "Razorpay",
  GATEWAY_STRIPE: "Stripe",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  OTHER: "Other",
};

export const DIRECTION_LABEL: Record<FinanceDirection, string> = { IN: "Money in", OUT: "Money out" };

export const PAYOUT_METHODS: readonly PayoutMethod[] = ["CASH", "BANK_TRANSFER", "UPI", "OTHER"];
export const PAYOUT_METHOD_LABEL: Record<PayoutMethod, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", UPI: "UPI", OTHER: "Other" };

/** Categories a manager may post by hand, per direction. */
export const MANUAL_CATEGORIES: Record<FinanceDirection, readonly FinanceCategory[]> = {
  IN: ["OTHER_INCOME"],
  OUT: ["RENT", "UTILITIES", "SUPPLIES", "OTHER_EXPENSE"],
};

/** Where an entry came from, for the ledger's "Source" column. */
export const SOURCE_LABEL: Record<string, string> = {
  Payment: "Loan payment",
  Refund: "Refund",
  RepairPayout: "Repair payout",
  PurchaseItem: "Purchase",
  Manual: "Manual entry",
  Reversal: "Reversal",
};

/** Every method except cash needs a reference (UTR, transaction or cheque number). */
export function needsReference(method: PayoutMethod | FinanceMethod) {
  return method !== "CASH";
}
