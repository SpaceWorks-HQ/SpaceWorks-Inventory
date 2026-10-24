import "server-only";

import type { LoanLine, PaymentStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import type { FeeLine, FeeOverrides } from "./fees";

/**
 * Shared helpers for the payment services. Lock order everywhere: the Loan
 * row, then Payment rows (by id), then Refund rows, so a payment change
 * never deadlocks with the loan workflow (which locks the loan first).
 */

export type Actor = { userId: string | null };

export async function lockLoanRow(tx: Tx, loanId: string, spaceId?: string) {
  const rows = spaceId
    ? await tx.$queryRaw<{ id: string; spaceId: string }[]>`SELECT "id", "spaceId" FROM "Loan" WHERE "id" = ${loanId} AND "spaceId" = ${spaceId} FOR UPDATE`
    : await tx.$queryRaw<{ id: string; spaceId: string }[]>`SELECT "id", "spaceId" FROM "Loan" WHERE "id" = ${loanId} FOR UPDATE`;
  if (rows.length === 0) throw new DomainError("That loan wasn't found.", "not_found");
  return rows[0]!;
}

/** Lock a payment (after its loan) and return the fresh row. */
export async function lockPayment(tx: Tx, spaceId: string, paymentId: string) {
  const link = await tx.payment.findFirst({ where: { id: paymentId, spaceId }, select: { loanId: true } });
  if (!link) throw new DomainError("That payment wasn't found.", "not_found");
  await lockLoanRow(tx, link.loanId, spaceId);
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  return tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
}

export const LOAN_FEE_INCLUDE = {
  space: true,
  lines: { include: { item: { include: { category: true } } }, orderBy: { id: "asc" as const } },
} as const;

type LineWithItem = LoanLine & { item: FeeOverrides & { consumable: boolean; replacementMinor: number | null; unitCostMinor: number; category: FeeOverrides | null } };

/** Units a line is charged for before and at issue: issued, else approved, else requested. */
export function chargedQuantity(line: LoanLine) {
  return line.quantityIssued > 0 ? line.quantityIssued : line.quantityApproved > 0 ? line.quantityApproved : line.quantityRequested;
}

/** Units still out with the borrower (consumed, returned, damaged and lost units are resolved). */
export function outstandingQuantity(line: LoanLine) {
  return Math.max(0, line.quantityIssued - line.quantityReturned - line.quantityDamaged - line.quantityLost - line.quantityConsumed);
}

export function feeLines(lines: LineWithItem[], quantity: (line: LoanLine) => number): FeeLine[] {
  return lines.map((line) => ({ quantity: quantity(line), item: line.item, category: line.item.category }));
}

/** Payment states that still hold their charges: settled, being confirmed, or in flight at a gateway. */
const HOLDING: PaymentStatus[] = ["PAID", "AWAITING_CONFIRMATION"];

/**
 * DUE charges of a loan that a new payment may take over: unattached, on a
 * failed or cancelled attempt, on a pay-later promise, or on an older gateway
 * attempt that was never finished. Charges awaiting a staff confirmation
 * stay where they are.
 */
export async function payableCharges(tx: Tx, loanId: string, kinds?: Array<"DEPOSIT" | "RENTAL" | "LATE_FEE" | "DAMAGE" | "LOSS">) {
  const charges = await tx.loanCharge.findMany({
    where: { loanId, status: "DUE", ...(kinds ? { kind: { in: kinds } } : {}) },
    include: { payment: { select: { id: true, status: true, payLater: true, provider: true } } },
    orderBy: { createdAt: "asc" },
  });
  return charges.filter((charge) => !charge.payment || !HOLDING.includes(charge.payment.status));
}

/**
 * Move charges onto a new payment. Older gateway attempts that lose every
 * charge are cancelled so a late capture on them is flagged, not counted.
 * Pay-later promises stay open until the new payment settles.
 */
export async function attachCharges(tx: Tx, chargeIds: string[], paymentId: string) {
  const previous = await tx.loanCharge.findMany({ where: { id: { in: chargeIds }, paymentId: { not: null } }, select: { paymentId: true } });
  await tx.loanCharge.updateMany({ where: { id: { in: chargeIds } }, data: { paymentId } });
  const ids = [...new Set(previous.map((row) => row.paymentId!))].filter((id) => id !== paymentId);
  for (const id of ids) {
    const left = await tx.loanCharge.count({ where: { paymentId: id } });
    if (left === 0) {
      await tx.payment.updateMany({ where: { id, status: "PENDING", payLater: false }, data: { status: "CANCELLED", note: "Replaced by a newer payment attempt." } });
    }
  }
}

/** The loan's open pay-later promise, if any. */
export function openPayLater(tx: Tx, loanId: string) {
  return tx.payment.findFirst({ where: { loanId, payLater: true, status: "PENDING" }, orderBy: { createdAt: "desc" } });
}

/**
 * A payment attempt ended without money: hand its DUE charges back to the
 * open pay-later promise, or leave them unattached so they show as due.
 */
export async function releaseCharges(tx: Tx, payment: { id: string; loanId: string }) {
  const promise = await openPayLater(tx, payment.loanId);
  await tx.loanCharge.updateMany({ where: { paymentId: payment.id, status: "DUE" }, data: { paymentId: promise && promise.id !== payment.id ? promise.id : null } });
}

export function loanBorrowerPath(slug: string, loanId: string) {
  return `/s/${slug}/my-loans/${loanId}`;
}

export function loanStaffPath(slug: string, loanId: string) {
  return `/s/${slug}/loans/${loanId}`;
}

export const FLAG_PREFIX = "Flagged: ";
