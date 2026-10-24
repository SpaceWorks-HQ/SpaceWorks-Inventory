import "server-only";

import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { gatewayTakes, loadGateway, type GatewayProvider } from "./config";
import { GatewayError, type CheckoutResult } from "./gateway";
import { attachCharges, lockLoanRow, payableCharges } from "./internal";
import { verifyCheckoutSignature } from "./razorpay";
import { failPayment, settlePayment } from "./settle";

export function payPagePath(slug: string, paymentId: string) {
  return `/s/${slug}/pay/${paymentId}`;
}

function absolute(path: string) {
  return `${(process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "")}${path}`;
}

/**
 * Borrower "Pay now": one gateway payment for every DUE charge of their own
 * loan (including any they promised to pay later). The Payment row and the
 * charge links commit first, then the provider order is created outside the
 * transaction; a refusal closes the attempt and hands the charges back.
 */
export async function startCheckout(args: { spaceId: string; loanId: string; payerId: string; provider: GatewayProvider; customer: { name: string; email: string } }): Promise<CheckoutResult & { paymentId: string }> {
  const live = await loadGateway(args.spaceId, args.provider);
  if (!live) throw new DomainError("Online payment isn't set up here. Pay at the desk instead.", "conflict");
  const space = await prisma.space.findUniqueOrThrow({ where: { id: args.spaceId }, select: { name: true, slug: true, currency: true } });
  if (!gatewayTakes(args.provider, space.currency)) throw new DomainError(`Online payment doesn't take ${space.currency}. Pay at the desk instead.`, "conflict");

  const payment = await prisma.$transaction(async (tx) => {
    await lockLoanRow(tx, args.loanId, args.spaceId);
    const loan = await tx.loan.findUniqueOrThrow({ where: { id: args.loanId }, select: { borrowerId: true, number: true } });
    if (loan.borrowerId !== args.payerId) throw new DomainError("That loan wasn't found.", "not_found");
    const charges = (await payableCharges(tx, args.loanId)).filter((charge) => charge.currency === space.currency);
    const amountMinor = charges.reduce((sum, charge) => sum + charge.amountMinor, 0);
    if (amountMinor <= 0) throw new DomainError("Nothing is due on this loan.", "conflict");
    const created = await tx.payment.create({
      data: { spaceId: args.spaceId, loanId: args.loanId, payerId: args.payerId, provider: args.provider, status: "PENDING", amountMinor, currency: space.currency },
    });
    await attachCharges(tx, charges.map((charge) => charge.id), created.id);
    return { ...created, reference: loanRef(loan.number) };
  });

  try {
    const path = payPagePath(space.slug, payment.id);
    const result = await live.gateway.createCheckout(live.credentials, {
      paymentId: payment.id,
      spaceId: args.spaceId,
      loanId: args.loanId,
      amountMinor: payment.amountMinor,
      currency: payment.currency,
      description: `${payment.reference} · ${space.name}`,
      spaceName: space.name,
      customer: args.customer,
      successUrl: absolute(`${path}?return=1`),
      cancelUrl: absolute(`${path}?cancelled=1`),
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { gatewayOrderId: result.orderId } });
    return { ...result, paymentId: payment.id };
  } catch (error) {
    await prisma.$transaction((tx) => failPayment(tx, { spaceId: args.spaceId, paymentId: payment.id, reason: "The payment provider couldn't start this payment." }));
    if (error instanceof GatewayError && error.retryable) throw new DomainError("The payment provider couldn't be reached. Try again in a minute.", "conflict");
    throw new DomainError("Couldn't start the payment. Try again later or pay at the desk.", "conflict");
  }
}

/**
 * Ask the provider where an open gateway attempt stands, then settle or fail
 * it. Used by the return page and the reconcile job, so a missed webhook
 * never leaves a paid borrower waiting. Returns the payment's status.
 */
export async function refreshGatewayPayment(spaceId: string, paymentId: string) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, spaceId }, select: { id: true, status: true, provider: true, gatewayOrderId: true } });
  if (!payment) return null;
  if (payment.provider === "OFFLINE" || !payment.gatewayOrderId || payment.status === "PAID") return payment.status;
  const live = await loadGateway(spaceId, payment.provider);
  if (!live) return payment.status;
  const fetched = await live.gateway.fetchPayment(live.credentials, payment.gatewayOrderId);
  if (fetched.status === "paid") {
    const settled = await prisma.$transaction((tx) => settlePayment(tx, { spaceId, paymentId, capture: { gatewayPaymentId: fetched.gatewayPaymentId, amountMinor: fetched.amountMinor, currency: fetched.currency, method: fetched.method } }));
    return settled.payment.status;
  }
  if (fetched.status === "failed" && payment.status === "PENDING") {
    const failed = await prisma.$transaction((tx) => failPayment(tx, { spaceId, paymentId, reason: fetched.reason }));
    return failed.status;
  }
  return payment.status;
}

/** Checkout.js finished in the browser: check Razorpay's signature, then settle from Razorpay's own record. */
export async function confirmRazorpayCheckout(args: { spaceId: string; payerId: string; paymentId: string; orderId: string; gatewayPaymentId: string; signature: string }) {
  const payment = await prisma.payment.findFirst({ where: { id: args.paymentId, spaceId: args.spaceId, provider: "RAZORPAY", payerId: args.payerId }, select: { gatewayOrderId: true } });
  if (!payment || payment.gatewayOrderId !== args.orderId) throw new DomainError("That payment wasn't found.", "not_found");
  const live = await loadGateway(args.spaceId, "RAZORPAY");
  if (!live) throw new DomainError("Online payment isn't set up here any more.", "conflict");
  if (!verifyCheckoutSignature(live.credentials.secret, args.orderId, args.gatewayPaymentId, args.signature)) throw new DomainError("Couldn't verify the payment. If money left your account, staff will match it.", "invalid");
  return refreshGatewayPayment(args.spaceId, args.paymentId);
}
