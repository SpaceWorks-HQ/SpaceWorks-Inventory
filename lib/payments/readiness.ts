import type { ChargeKind, ChargeStatus, PaymentStatus } from "@prisma/client";
import { depositFor, rentalFor, type FeeLine, type SpaceFeePolicy } from "./fees";

type Payment = { status: PaymentStatus; payLater: boolean };
type Charge = { kind: ChargeKind; status: ChargeStatus; paymentId: string | null };

/** Same payment gate for the workflow and the desk, including a loan-wide pay-later promise. */
export function issuePaymentReady(paymentBeforeIssue: boolean, charges: readonly Charge[], payments: readonly (Payment & { id: string })[]): boolean {
  if (!paymentBeforeIssue || payments.some((p) => p.payLater && p.status === "PENDING")) return true;
  return charges.filter((c) => c.status === "DUE" && (c.kind === "DEPOSIT" || c.kind === "RENTAL")).every((charge) => {
    const payment = payments.find((p) => p.id === charge.paymentId);
    return payment?.status === "PAID";
  });
}

/** Self-checkout creates deposit/rental charges even when payment before issue is off. */
export function selfCheckoutPaymentReady(space: SpaceFeePolicy & { payLaterEnabled: boolean }, lines: FeeLine[], days: number): boolean {
  return space.payLaterEnabled || (depositFor(space, lines) === 0 && rentalFor(space, lines, days) === 0);
}
