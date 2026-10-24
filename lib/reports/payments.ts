import "server-only";

import type { PaymentProvider } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { DateRange } from "./range";
import type { ReportTable } from "./table";

const PROVIDER_WORD: Record<PaymentProvider, string> = { RAZORPAY: "Razorpay", STRIPE: "Stripe", OFFLINE: "Cash or bank" };

export type PaymentsReport = {
  hasPayments: boolean;
  collectedMinor: number;
  collectedCount: number;
  pendingMinor: number;
  pendingCount: number;
  payLaterMinor: number;
  refundedMinor: number;
  waivedMinor: number;
  dueMinor: number;
  byProvider: { provider: PaymentProvider; label: string; payments: number; amountMinor: number }[];
};

/** Money in the range: collected, refunded and waived; plus what is still pending or due today. */
export async function paymentsReport(spaceId: string, range: DateRange): Promise<PaymentsReport> {
  const inRange = { gte: range.from, lt: range.to };
  const [any, collected, pending, payLater, refunded, waived, due] = await Promise.all([
    prisma.payment.count({ where: { spaceId }, take: 1 }),
    prisma.payment.groupBy({ by: ["provider"], where: { spaceId, status: "PAID", paidAt: inRange }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { spaceId, status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } }, _sum: { amountMinor: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { spaceId, status: "PENDING", payLater: true }, _sum: { amountMinor: true } }),
    prisma.refund.aggregate({ where: { spaceId, status: "PROCESSED", processedAt: inRange }, _sum: { amountMinor: true } }),
    prisma.loanCharge.aggregate({ where: { spaceId, status: "WAIVED", updatedAt: inRange }, _sum: { amountMinor: true } }),
    prisma.loanCharge.aggregate({ where: { spaceId, status: "DUE" }, _sum: { amountMinor: true } }),
  ]);
  const byProvider = collected
    .map((row) => ({ provider: row.provider, label: PROVIDER_WORD[row.provider], payments: row._count._all, amountMinor: row._sum.amountMinor ?? 0 }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
  return {
    hasPayments: any > 0,
    collectedMinor: byProvider.reduce((sum, row) => sum + row.amountMinor, 0),
    collectedCount: byProvider.reduce((sum, row) => sum + row.payments, 0),
    pendingMinor: pending._sum.amountMinor ?? 0,
    pendingCount: pending._count._all,
    payLaterMinor: payLater._sum.amountMinor ?? 0,
    refundedMinor: refunded._sum.amountMinor ?? 0,
    waivedMinor: waived._sum.amountMinor ?? 0,
    dueMinor: due._sum.amountMinor ?? 0,
    byProvider,
  };
}

export function paymentsTables(report: PaymentsReport): ReportTable[] {
  return [
    {
      title: "Payments summary",
      columns: [{ key: "label", label: "Measure" }, { key: "amount", label: "Amount", kind: "money" }],
      rows: [
        { label: "Collected in period", amount: report.collectedMinor },
        { label: "Refunded in period", amount: report.refundedMinor },
        { label: "Waived in period", amount: report.waivedMinor },
        { label: "Pending now", amount: report.pendingMinor },
        { label: "Pay later now", amount: report.payLaterMinor },
        { label: "Charges due now", amount: report.dueMinor },
      ],
    },
    {
      title: "Collected by method",
      columns: [{ key: "label", label: "Method" }, { key: "payments", label: "Payments", kind: "number" }, { key: "amount", label: "Amount", kind: "money" }],
      rows: report.byProvider.map((row) => ({ label: row.label, payments: row.payments, amount: row.amountMinor })),
    },
  ];
}
