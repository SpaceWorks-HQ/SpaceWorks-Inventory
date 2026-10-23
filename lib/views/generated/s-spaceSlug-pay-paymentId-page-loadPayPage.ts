// Generated from app/s/[spaceSlug]/pay/[paymentId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format/money";
import { refreshGatewayPayment } from "@/lib/payments/checkout";
import { requireSpace } from "@/lib/permissions";
const STATUS: Record<string, { label: string; tone: "success" | "info" | "warning" | "danger" | "neutral"; text: string }> = {
  PAID: { label: "Paid", tone: "success", text: "Thanks. Your payment is in and the loan is updated." },
  PENDING: { label: "Payment pending", tone: "info", text: "We haven't heard from the payment provider yet. This page updates when you reload it, and the loan updates on its own when the payment lands." },
  AWAITING_CONFIRMATION: { label: "Awaiting confirmation", tone: "warning", text: "Staff will confirm this payment when it reaches the space." },
  FAILED: { label: "Not paid", tone: "danger", text: "The payment didn't go through. Nothing was charged. Try again from the loan." },
  CANCELLED: { label: "Cancelled", tone: "neutral", text: "This payment attempt was closed. Pay again from the loan if something is still due." },
};
export async function loadPayPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/pay/[paymentId]">) {
const { spaceSlug, paymentId } = await params;
const { space, user } = await requireSpace(spaceSlug);
const query = await searchParams;
const returned = query.return === "1";
const cancelled = query.cancelled === "1";
const payment = await prisma.payment.findFirst({
    where: { id: paymentId, spaceId: space.id, payerId: user.id },
    select: { id: true, status: true, provider: true, amountMinor: true, currency: true, gatewayOrderId: true, loan: { select: { id: true, number: true } } },
  });
if (!payment) notFound();
let status = payment.status as string;
let checkFailed = false;
if (returned && payment.provider !== "OFFLINE" && status === "PENDING") {
    try {
      status = (await refreshGatewayPayment(space.id, payment.id)) ?? status;
    } catch {
      checkFailed = true;
    }
  }
const config = payment.provider === "RAZORPAY" ? await prisma.spacePaymentConfig.findUnique({ where: { spaceId: space.id }, select: { razorpayKeyId: true } }) : null;
const showCheckout = !returned && !cancelled && status === "PENDING" && payment.provider === "RAZORPAY" && Boolean(payment.gatewayOrderId && config?.razorpayKeyId);
const nonce = showCheckout ? ((await headers()).get("x-nonce") ?? undefined) : undefined;
const reference = loanRef(payment.loan.number);
const amountLabel = formatMoney(payment.amountMinor, payment.currency);
const loanHref = `/s/${space.slug}/my-loans/${payment.loan.id}`;
const word = STATUS[status] ?? STATUS.PENDING!;
const checkout = showCheckout
    ? { spaceSlug: space.slug, paymentId: payment.id, keyId: config!.razorpayKeyId!, orderId: payment.gatewayOrderId!, amountMinor: payment.amountMinor, currency: payment.currency, amountLabel, spaceName: space.name, description: reference, prefill: { name: user.name ?? "", email: user.email }, nonce }
    : null;
return viewDto({ cancelled, status, checkFailed, reference, amountLabel, loanHref, word, checkout } as const);
}
