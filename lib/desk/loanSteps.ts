import "server-only";

import type { z } from "zod";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { outstanding } from "@/lib/lending/policy";
import { processQueuedRefunds } from "@/lib/payments/refundGateway";
import { approveLoan, cancelLoan, issueLoan, rejectLoan, renewLoan, requestLoan, resolveIncident, returnLoan, selfCheckout, setDueDate } from "@/lib/lending/workflow";
import { dateInputToDate } from "./dates";
import { withEvidencePhotos } from "./photos";
import type { approveLoanSchema, issueLoanSchema, reasonSchema, rejectLoanSchema, requestLoanSchema, resolveIncidentSchema, returnLoanSchema, selfCheckoutSchema, selfReturnSchema, setDueSchema } from "./loansSchemas";

/**
 * The lending desk and borrowing steps behind app/actions/loans.ts: each
 * turns validated form input into one workflow call inside one transaction.
 * Handovers store their photos first and remove them again if the workflow
 * refuses. `spaceId` always comes from the caller's resolved space.
 */
export type StepContext = { spaceId: string; userId: string; timeZone: string };

const OPTIONS = { timeout: 30_000, maxWait: 10_000 };
const actorOf = (ctx: StepContext) => ({ userId: ctx.userId });

export function approveStep(ctx: StepContext, input: z.infer<typeof approveLoanSchema>) {
  return prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.spaceId, loanId: input.loanId, quantities: input.quantities }, actorOf(ctx)), OPTIONS);
}

export function rejectStep(ctx: StepContext, input: z.infer<typeof rejectLoanSchema>) {
  return prisma.$transaction((tx) => rejectLoan(tx, { spaceId: ctx.spaceId, loanId: input.loanId, reason: input.reason }, actorOf(ctx)), OPTIONS);
}

/** Staff withdraw a request (or ready loan); with `byBorrower` only the member's own. */
export async function cancelStep(ctx: StepContext, input: z.infer<typeof reasonSchema>, byBorrower = false) {
  const { refundIds } = await prisma.$transaction((tx) => cancelLoan(tx, { spaceId: ctx.spaceId, loanId: input.loanId, reason: input.reason || null, ...(byBorrower ? { byBorrowerId: ctx.userId } : {}) }, actorOf(ctx)), OPTIONS);
  // Paid deposits or rental go back once the cancellation has committed; a gateway hiccup is retried by the reconcile job.
  if (refundIds.length) await processQueuedRefunds(ctx.spaceId, refundIds).catch(() => undefined);
  return { refundIds };
}

export function issueStep(ctx: StepContext, input: z.infer<typeof issueLoanSchema>, files: File[]) {
  return withEvidencePhotos(ctx.spaceId, files, (photos) =>
    prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.spaceId, loanId: input.loanId, scannedCodes: input.scannedCodes, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes } }, actorOf(ctx)), OPTIONS));
}

export function returnStep(ctx: StepContext, input: z.infer<typeof returnLoanSchema>, files: File[]) {
  return withEvidencePhotos(ctx.spaceId, files, (photos) =>
    prisma.$transaction((tx) => returnLoan(tx, {
      spaceId: ctx.spaceId,
      loanId: input.loanId,
      scannedCodes: input.scannedCodes,
      lines: input.lines.map((line) => ({ lineId: line.lineId, returned: line.returned, damaged: line.damaged, lost: line.lost, locationId: line.locationId || null })),
      evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes },
    }, actorOf(ctx)), OPTIONS));
}

/** A self-checkout borrower brings everything back: every outstanding unit is returned. */
export function selfReturnStep(ctx: StepContext, input: z.infer<typeof selfReturnSchema>, files: File[]) {
  return withEvidencePhotos(ctx.spaceId, files, (photos) =>
    prisma.$transaction(async (tx) => {
      const lines = await tx.loanLine.findMany({ where: { loanId: input.loanId, loan: { spaceId: ctx.spaceId, borrowerId: ctx.userId } } });
      if (lines.length === 0) throw new DomainError("That loan wasn't found.", "not_found");
      const changes = lines.filter((line) => outstanding(line) > 0).map((line) => ({ lineId: line.id, returned: outstanding(line), damaged: 0, lost: 0 }));
      if (changes.length === 0) throw new DomainError("Everything on this loan is already back.", "conflict");
      return returnLoan(tx, { spaceId: ctx.spaceId, loanId: input.loanId, scannedCodes: input.scannedCodes, lines: changes, byBorrowerId: ctx.userId, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes } }, actorOf(ctx));
    }, OPTIONS));
}

export function renewStep(ctx: StepContext, loanId: string, byBorrower = false) {
  return prisma.$transaction((tx) => renewLoan(tx, { spaceId: ctx.spaceId, loanId, ...(byBorrower ? { byBorrowerId: ctx.userId } : {}) }, actorOf(ctx)), OPTIONS);
}

export function setDueStep(ctx: StepContext, input: z.infer<typeof setDueSchema>) {
  const dueAt = dateInputToDate(input.dueDate, ctx.timeZone, "18:00");
  if (!dueAt || Number.isNaN(dueAt.getTime())) throw new DomainError("Pick a due date.", "invalid");
  return prisma.$transaction((tx) => setDueDate(tx, { spaceId: ctx.spaceId, loanId: input.loanId, dueAt }, actorOf(ctx)), OPTIONS);
}

export function resolveIncidentStep(ctx: StepContext, input: z.infer<typeof resolveIncidentSchema>) {
  return prisma.$transaction((tx) => resolveIncident(tx, { spaceId: ctx.spaceId, incidentId: input.incidentId, resolution: input.resolution, note: input.note, locationId: input.locationId || null }, actorOf(ctx)), OPTIONS);
}

/** A member sends their tray as a loan request. */
export async function requestStep(ctx: StepContext, input: z.infer<typeof requestLoanSchema>) {
  const neededFrom = dateInputToDate(input.neededFrom, ctx.timeZone, "09:00");
  if (neededFrom && Number.isNaN(neededFrom.getTime())) throw new DomainError("Pick a valid date.", "invalid");
  const loan = await prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.spaceId, borrowerId: ctx.userId, lines: input.lines, purpose: input.purpose || null, neededFrom }, actorOf(ctx)), OPTIONS);
  return { loanId: loan.id };
}

export async function selfCheckoutStep(ctx: StepContext, input: z.infer<typeof selfCheckoutSchema>, files: File[]) {
  const loan = await withEvidencePhotos(ctx.spaceId, files, (photos) =>
    prisma.$transaction((tx) => selfCheckout(tx, { spaceId: ctx.spaceId, borrowerId: ctx.userId, scannedCodes: input.scannedCodes, quantities: input.quantities, evidence: { photos, remarks: input.remarks, scannedCodes: input.scannedCodes } }, actorOf(ctx)), OPTIONS));
  return { loanId: loan.id };
}
