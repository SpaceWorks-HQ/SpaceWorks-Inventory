import "server-only";

import type { ChargeKind, LoanStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { depositFor, incidentChargeFor, incidentChargeKind, lateFeeFor, loanDays, rentalFor, renewalRentalFor } from "./fees";
import { chargedQuantity, feeLines, LOAN_FEE_INCLUDE, lockLoanRow, openPayLater, outstandingQuantity } from "./internal";

/**
 * The charges side of the loan workflow. Every function takes the
 * workflow's transaction (it never opens its own) and is safe to call twice.
 */

export { cancelOpenCharges, payLaterForLoan, waiveCharge } from "./chargeChanges";
export { loanPaymentSummary } from "./summary";

const CLOSED: LoanStatus[] = ["REJECTED", "CANCELLED", "RETURNED", "CLOSED_WITH_ISSUE"];
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

async function loadLoan(tx: Tx, loanId: string) {
  await lockLoanRow(tx, loanId);
  return tx.loan.findUniqueOrThrow({ where: { id: loanId }, include: LOAN_FEE_INCLUDE });
}

/**
 * At approval or self-checkout: the deposit and rental the loan owes, as DUE
 * charges in the space currency. Called again before issue it replaces DUE
 * deposit/rental charges nobody has started paying; a kind that already has
 * a payment (or is paid or waived) is left alone. Zero creates nothing.
 */
export async function createLoanCharges(tx: Tx, args: { loanId: string; now?: Date }) {
  const loan = await loadLoan(tx, args.loanId);
  if (CLOSED.includes(loan.status)) return [];
  const lines = feeLines(loan.lines, chargedQuantity);
  const days = loanDays(loan.issuedAt ?? args.now ?? new Date(), loan.dueAt);
  const wanted: Array<{ kind: ChargeKind; amountMinor: number; description: string }> = [
    { kind: "DEPOSIT", amountMinor: depositFor(loan.space, lines), description: "Refundable deposit" },
    { kind: "RENTAL", amountMinor: rentalFor(loan.space, lines, days), description: `Rental for ${plural(days, "day")}` },
  ];
  const existing = await tx.loanCharge.findMany({ where: { loanId: loan.id, kind: { in: ["DEPOSIT", "RENTAL"] }, status: { not: "CANCELLED" } } });
  for (const want of wanted) {
    const ofKind = existing.filter((charge) => charge.kind === want.kind);
    if (ofKind.some((charge) => charge.status !== "DUE" || charge.paymentId)) continue;
    if (ofKind.length === 1 && ofKind[0]!.amountMinor === want.amountMinor && ofKind[0]!.description === want.description) continue;
    if (ofKind.length > 0) await tx.loanCharge.deleteMany({ where: { id: { in: ofKind.map((charge) => charge.id) }, status: "DUE", paymentId: null } });
    if (want.amountMinor > 0) {
      await tx.loanCharge.create({ data: { spaceId: loan.spaceId, loanId: loan.id, kind: want.kind, description: want.description, amountMinor: want.amountMinor, currency: loan.space.currency } });
    }
  }
  return tx.loanCharge.findMany({ where: { loanId: loan.id, kind: { in: ["DEPOSIT", "RENTAL"] }, status: { not: "CANCELLED" } }, orderBy: { createdAt: "asc" } });
}

/**
 * Before issue, when the space wants money first: every DUE deposit or
 * rental must be covered by a PAID payment or an open pay-later promise.
 * An offline payment still awaiting a staff confirmation does not count.
 */
export async function assertIssueAllowed(tx: Tx, args: { loanId: string }) {
  const loan = await tx.loan.findUniqueOrThrow({ where: { id: args.loanId }, select: { id: true, space: { select: { paymentBeforeIssue: true } } } });
  if (!loan.space.paymentBeforeIssue) return;
  const due = await tx.loanCharge.findMany({
    where: { loanId: loan.id, status: "DUE", kind: { in: ["DEPOSIT", "RENTAL"] } },
    select: { payment: { select: { status: true, payLater: true } } },
  });
  if (due.length === 0) return;
  const promise = await openPayLater(tx, loan.id);
  const covered = (charge: (typeof due)[number]) => charge.payment?.status === "PAID" || (charge.payment?.payLater && charge.payment.status === "PENDING") || Boolean(promise);
  if (!due.every(covered)) throw new DomainError("Collect the deposit and rental first, or mark it pay later.", "conflict");
}

/** When a loan is fully returned: one LATE_FEE charge if it came back late. Returns the charge or null. */
export async function addLateFee(tx: Tx, args: { loanId: string; returnedAt: Date }) {
  const loan = await loadLoan(tx, args.loanId);
  const existing = await tx.loanCharge.findFirst({ where: { loanId: loan.id, kind: "LATE_FEE", status: { not: "CANCELLED" } } });
  if (existing) return existing;
  const fee = lateFeeFor(loan.space, feeLines(loan.lines, (line) => line.quantityIssued), loan.dueAt, args.returnedAt);
  if (fee.amountMinor <= 0) return null;
  return tx.loanCharge.create({
    data: { spaceId: loan.spaceId, loanId: loan.id, kind: "LATE_FEE", description: `Late fee, ${plural(fee.daysLate, "day")} late`, amountMinor: fee.amountMinor, currency: loan.space.currency },
  });
}

/** A lost or damaged incident: one DAMAGE or LOSS charge linked to it, when the space charges for them. */
export async function addIncidentCharge(tx: Tx, args: { incidentId: string }) {
  const incident = await tx.loanIncident.findUniqueOrThrow({
    where: { id: args.incidentId },
    include: { line: { include: { item: { select: { name: true, replacementMinor: true, unitCostMinor: true } } } }, space: true },
  });
  await lockLoanRow(tx, incident.loanId, incident.spaceId);
  const existing = await tx.loanCharge.findFirst({ where: { incidentId: incident.id } });
  if (existing) return existing;
  const amountMinor = incidentChargeFor(incident.space, incident.line.item, incident.quantity);
  if (amountMinor <= 0) return null;
  const word = incident.kind === "LOST" ? "Lost" : "Damaged";
  return tx.loanCharge.create({
    data: {
      spaceId: incident.spaceId,
      loanId: incident.loanId,
      kind: incidentChargeKind(incident.kind),
      description: `${word}: ${incident.line.item.name} × ${incident.quantity}`.slice(0, 200),
      amountMinor,
      currency: incident.space.currency,
      incidentId: incident.id,
    },
  });
}

/**
 * After a renewal moved the due date (call it after updating `dueAt`): a
 * RENTAL charge for the extra days of every unit still out, under per-day
 * or per-week rental. Free and flat rentals add nothing.
 */
export async function addRenewalCharge(tx: Tx, args: { loanId: string; extraDays: number }) {
  if (!Number.isInteger(args.extraDays) || args.extraDays <= 0) return null;
  const loan = await loadLoan(tx, args.loanId);
  const newDays = loanDays(loan.issuedAt ?? loan.createdAt, loan.dueAt);
  const oldDays = Math.max(1, newDays - args.extraDays);
  const amountMinor = renewalRentalFor(loan.space, feeLines(loan.lines, outstandingQuantity), oldDays, newDays);
  if (amountMinor <= 0) return null;
  return tx.loanCharge.create({
    data: { spaceId: loan.spaceId, loanId: loan.id, kind: "RENTAL", description: `Rental for ${plural(args.extraDays, "more day")}`, amountMinor, currency: loan.space.currency },
  });
}
