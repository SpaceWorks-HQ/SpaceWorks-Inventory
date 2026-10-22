"use server";

import { z } from "zod";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { revalidatePath } from "@/lib/frontend/cache";
import { canBorrow, canManagePayments, canTakePayments } from "@/lib/roles";
import { idSchema } from "@/lib/validation";
import { payLaterForLoan, waiveCharge } from "@/lib/payments/charges";
import { confirmRazorpayCheckout, payPagePath, startCheckout } from "@/lib/payments/checkout";
import { paymentConfigSchema, savePaymentConfig, testConnection } from "@/lib/payments/config";
import { recordOfflinePayment, reviewOfflinePayment, submitOfflinePayment } from "@/lib/payments/offline";
import { processQueuedRefunds, retryRefund } from "@/lib/payments/refundGateway";
import { queueRefund, returnDeposit } from "@/lib/payments/refunds";
import { OFFLINE_METHODS } from "@/lib/payments/types";

/**
 * Payments: provider settings (ADMIN), the borrower's own pay now / pay
 * later / offline submission, and the desk's offline payments, waivers,
 * deposit returns and refunds (STAFF). Gateway calls never run inside a
 * database transaction.
 */

const provider = z.enum(["RAZORPAY", "STRIPE"]);
const money = z.number().int().min(0).max(100_000_000);
const reason = z.string().trim().max(500);
const loanInput = z.object({ loanId: idSchema });

function done(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

async function run<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return domainFailure(error);
  }
}

export async function savePaymentSettingsAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManagePayments);
  if (denied) return denied;
  const parsed = paymentConfigSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => savePaymentConfig(ctx.space.id, parsed.data, { userId: ctx.user.id }));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

export async function testPaymentConnectionAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManagePayments);
  if (denied) return denied;
  const parsed = z.object({ provider }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await testConnection(ctx.space.id, parsed.data.provider);
  return result.ok ? { ok: true } : actionError(result.error);
}

/** Borrower pays every due charge of their own loan online. Razorpay opens the pay page; Stripe redirects. */
export async function payNowAction(slug: string, input: unknown): Promise<ActionResult<{ url: string }>> {
  const { ctx, denied } = await spaceAction(slug, canBorrow);
  if (denied) return denied;
  const parsed = loanInput.extend({ provider }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => startCheckout({ spaceId: ctx.space.id, loanId: parsed.data.loanId, payerId: ctx.user.id, provider: parsed.data.provider, customer: { name: ctx.user.name ?? "", email: ctx.user.email } }));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true, data: { url: result.value.kind === "redirect" ? result.value.url : payPagePath(ctx.space.slug, result.value.paymentId) } };
}

const razorpayInput = z.object({ paymentId: idSchema, orderId: z.string().trim().min(1).max(100), gatewayPaymentId: z.string().trim().min(1).max(100), signature: z.string().trim().regex(/^[a-f0-9]{64}$/i) });

export async function confirmRazorpayPaymentAction(slug: string, input: unknown): Promise<ActionResult<{ status: string | null }>> {
  const { ctx, denied } = await spaceAction(slug, canBorrow);
  if (denied) return denied;
  const parsed = razorpayInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => confirmRazorpayCheckout({ spaceId: ctx.space.id, payerId: ctx.user.id, ...parsed.data }));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true, data: { status: result.value } };
}

/** Borrower promises to pay later (when the space allows it). */
export async function payLaterAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canBorrow);
  if (denied) return denied;
  const parsed = loanInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (!ctx.space.payLaterEnabled) return actionError("This space doesn't offer pay later. Pay now or at the desk.");
  const result = await run(() => prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: parsed.data.loanId, spaceId: ctx.space.id, borrowerId: ctx.user.id }, select: { id: true } });
    if (!loan) throw new DomainError("That loan wasn't found.", "not_found");
    return payLaterForLoan(tx, { loanId: loan.id, payerId: ctx.user.id, kinds: ["DEPOSIT", "RENTAL", "LATE_FEE", "DAMAGE", "LOSS"] });
  }));
  if (!result.ok) return result;
  if (result.value.amountMinor === 0) return actionError("Nothing is due on this loan.");
  done(ctx.space.slug);
  return { ok: true };
}

const offlineInput = loanInput.extend({ method: z.enum(OFFLINE_METHODS), reference: z.string().trim().max(120).default(""), note: z.string().trim().max(500).optional() });

export async function submitOfflinePaymentAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canBorrow);
  if (denied) return denied;
  const parsed = offlineInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction((tx) => submitOfflinePayment(tx, { spaceId: ctx.space.id, payerId: ctx.user.id, ...parsed.data })));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

// ───────────── Desk (STAFF and above) ─────────────

export async function markPayLaterAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = loanInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: parsed.data.loanId, spaceId: ctx.space.id }, select: { id: true, borrowerId: true } });
    if (!loan) throw new DomainError("That loan wasn't found.", "not_found");
    return payLaterForLoan(tx, { loanId: loan.id, payerId: loan.borrowerId, actorId: ctx.user.id, kinds: ["DEPOSIT", "RENTAL", "LATE_FEE", "DAMAGE", "LOSS"] });
  }));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

export async function recordOfflinePaymentAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = offlineInput.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction((tx) => recordOfflinePayment(tx, { spaceId: ctx.space.id, actorId: ctx.user.id, ...parsed.data })));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

export async function reviewOfflinePaymentAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = z.object({ paymentId: idSchema, decision: z.enum(["confirm", "reject"]), reason: reason.optional() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction((tx) => reviewOfflinePayment(tx, { spaceId: ctx.space.id, actorId: ctx.user.id, ...parsed.data })));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

export async function waiveChargeAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = z.object({ chargeId: idSchema, reason: reason.min(1, "Say why this charge is waived.") }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction((tx) => waiveCharge(tx, { spaceId: ctx.space.id, chargeId: parsed.data.chargeId, reason: parsed.data.reason, actorId: ctx.user.id })));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return { ok: true };
}

export async function returnDepositAction(slug: string, input: unknown): Promise<ActionResult<{ status: string }>> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = loanInput.extend({ deductionMinor: money.default(0), reason: reason.default("") }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction((tx) => returnDeposit(tx, { spaceId: ctx.space.id, actorId: ctx.user.id, ...parsed.data })));
  if (!result.ok) return result;
  const [outcome] = result.value ? await processQueuedRefunds(ctx.space.id, [result.value.id]) : [];
  done(ctx.space.slug);
  if (outcome?.error) return actionError(outcome.error);
  return { ok: true, data: { status: outcome?.status ?? "PROCESSED" } };
}

/** Refund money on a flagged payment (a mismatched amount or a double payment). */
export async function refundPaymentAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = z.object({ paymentId: idSchema, amountMinor: money.min(1, "Enter an amount to refund."), reason: reason.min(1, "Say why this is refunded.") }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id: parsed.data.paymentId, spaceId: ctx.space.id }, select: { provider: true } });
    if (!payment) throw new DomainError("That payment wasn't found.", "not_found");
    return queueRefund(tx, { spaceId: ctx.space.id, paymentId: parsed.data.paymentId, amountMinor: parsed.data.amountMinor, reason: parsed.data.reason, actorId: ctx.user.id, cash: payment.provider === "OFFLINE" });
  }));
  if (!result.ok) return result;
  const [outcome] = await processQueuedRefunds(ctx.space.id, [result.value.id]);
  done(ctx.space.slug);
  return outcome?.error ? actionError(outcome.error) : { ok: true };
}

export async function retryRefundAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canTakePayments);
  if (denied) return denied;
  const parsed = z.object({ refundId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await run(() => retryRefund(ctx.space.id, parsed.data.refundId, ctx.user.id));
  if (!result.ok) return result;
  done(ctx.space.slug);
  return result.value.error ? actionError(result.value.error) : { ok: true };
}
