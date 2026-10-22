import "server-only";

import { prisma } from "@/lib/db";
import { refreshGatewayPayment } from "./checkout";
import { sendRefund } from "./refundGateway";
import { failPayment } from "./settle";

const MINUTE = 60_000;
/** Give webhooks a head start before polling. */
const POLL_AFTER_MS = 10 * MINUTE;
/** An attempt still open after a day is closed; a capture after that is still settled and flagged. */
const CLOSE_AFTER_MS = 24 * 60 * MINUTE;
/** Keep asking about refunds for a month (bank refunds are slow). */
const REFUND_CHECK_FOR_MS = 30 * 24 * 60 * MINUTE;
const BATCH = 50;

async function closeIfStale(payment: { id: string; spaceId: string; createdAt: Date }, now: Date) {
  if (now.getTime() - payment.createdAt.getTime() <= CLOSE_AFTER_MS) return;
  await prisma.$transaction((tx) => failPayment(tx, { spaceId: payment.spaceId, paymentId: payment.id, reason: "Closed: no payment arrived within a day." }));
}

/**
 * Scheduled job: poll Razorpay/Stripe for gateway payments still PENDING
 * after 10 minutes (a missed webhook never leaves a borrower waiting), and
 * send or re-check gateway refunds still PENDING. Attempts checked longest
 * ago go first (`updatedAt` is touched on each check). Idempotent and safe
 * to overlap; one space's bad keys never stop the others.
 */
export async function reconcilePendingPayments(now = new Date()) {
  const cutoff = new Date(now.getTime() - POLL_AFTER_MS);
  const open = await prisma.payment.findMany({
    where: { status: "PENDING", payLater: false, provider: { in: ["RAZORPAY", "STRIPE"] }, gatewayOrderId: { not: null }, createdAt: { lte: cutoff } },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: { id: true, spaceId: true, createdAt: true },
  });
  let settled = 0;
  for (const payment of open) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { updatedAt: now } });
    try {
      const status = await refreshGatewayPayment(payment.spaceId, payment.id);
      if (status === "PAID") settled += 1;
      else if (status === "PENDING") await closeIfStale(payment, now);
    } catch {
      console.error("[payments reconcile] one payment could not be checked");
      await closeIfStale(payment, now).catch(() => undefined);
    }
  }

  const refunds = await prisma.refund.findMany({
    where: { status: "PENDING", createdAt: { lte: cutoff, gte: new Date(now.getTime() - REFUND_CHECK_FOR_MS) }, payment: { provider: { in: ["RAZORPAY", "STRIPE"] } } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true, spaceId: true },
  });
  let refunded = 0;
  for (const refund of refunds) {
    try {
      if ((await sendRefund(refund.spaceId, refund.id)).status === "PROCESSED") refunded += 1;
    } catch {
      console.error("[payments reconcile] one refund could not be checked");
    }
  }
  return { checked: open.length, settled, refundsChecked: refunds.length, refunded };
}
