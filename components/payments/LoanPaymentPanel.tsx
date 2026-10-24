"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  markPayLaterAction, payLaterAction, payNowAction, recordOfflinePaymentAction, refundPaymentAction, retryRefundAction,
  returnDepositAction, reviewOfflinePaymentAction, submitOfflinePaymentAction, waiveChargeAction,
} from "@/app/actions/payments";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip, DetailList } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format/money";
import { OFFLINE_METHOD_LABEL, type LoanPaymentSummary, type LoanPaymentViewer, type OfflineMethod } from "@/lib/payments/types";
import { AmountReasonDialog, OfflinePaymentDialog, ReasonDialog } from "./PaymentDialogs";

type Props = { summary: LoanPaymentSummary; spaceSlug: string; loanId: string; viewer: LoanPaymentViewer };

const PROVIDER_BUTTON: Record<"RAZORPAY" | "STRIPE", string> = { RAZORPAY: "UPI, card or net banking", STRIPE: "card" };

/** Charges, payments and refunds of one loan, with the actions that apply to this viewer. */
export function LoanPaymentPanel({ summary, spaceSlug, loanId, viewer }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, start] = useTransition();
  const money = (minor: number) => formatMoney(minor, summary.currency);
  const staff = viewer === "staff";
  const { actions, totals } = summary;
  const owed = totals.dueMinor;

  const quick = (work: () => Promise<{ ok: boolean; error?: string; data?: { url?: string } }>, success: string) =>
    start(async () => {
      const result = await work();
      if (!result.ok) return showToast(result.error ?? "Couldn't save. Try again.", "error");
      if (result.data?.url) {
        window.location.assign(result.data.url);
        return;
      }
      showToast(success, "success");
      router.refresh();
    });

  if (summary.charges.length === 0 && summary.payments.length === 0) {
    return (
      <Card>
        <CardHeader title="Payments" description="Nothing to pay for this loan." action={<Chip tone="neutral">No charges</Chip>} titleAs="h3" />
      </Card>
    );
  }

  const offline = (mode: "submit" | "record") => (
    <OfflinePaymentDialog
      mode={mode}
      amountMinor={owed + totals.payLaterMinor}
      currency={summary.currency}
      instructions={summary.offline.instructions}
      onSubmit={(input: { method: OfflineMethod; reference: string; note: string }) => (mode === "record" ? recordOfflinePaymentAction : submitOfflinePaymentAction)(spaceSlug, { loanId, ...input })}
    />
  );

  return (
    <Card className="space-y-5">
      <CardHeader title="Payments" titleAs="h3" action={<Chip tone={summary.headline.tone}>{summary.headline.label}</Chip>} />

      <Table label="Charges">
        <THead>
          <TR>
            <TH>Charge</TH>
            <TH className="text-right">Amount</TH>
            <TH>Status</TH>
            {staff ? <TH><span className="sr-only">Actions</span></TH> : null}
          </TR>
        </THead>
        <TBody>
          {summary.charges.map((charge) => (
            <TR key={charge.id}>
              <TD>
                <span className="block font-semibold text-ink">{charge.description}</span>
                {charge.waivedReason ? <span className="block text-caption text-ink-muted">{charge.status === "WAIVED" ? "Waived" : "Kept"}: {charge.waivedReason}</span> : null}
              </TD>
              <TD className="text-right tabular-nums">{money(charge.amountMinor)}</TD>
              <TD><Chip tone={charge.tone} size="sm">{charge.statusLabel}</Chip></TD>
              {staff ? (
                <TD className="text-right">
                  {charge.canWaive ? (
                    <ReasonDialog
                      trigger="Waive…"
                      variant="quiet"
                      title={`Waive ${money(charge.amountMinor)}`}
                      description={charge.description}
                      submitLabel="Waive charge"
                      success="Charge waived."
                      onSubmit={(reason) => waiveChargeAction(spaceSlug, { chargeId: charge.id, reason })}
                    />
                  ) : null}
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>

      <DetailList
        items={[
          ...(owed > 0 ? [{ label: "Due now", value: money(owed) }] : []),
          ...(totals.payLaterMinor > 0 ? [{ label: "Payment pending", value: money(totals.payLaterMinor) }] : []),
          ...(totals.awaitingMinor > 0 ? [{ label: "Awaiting confirmation", value: money(totals.awaitingMinor) }] : []),
          { label: "Paid", value: money(totals.paidMinor) },
          ...(totals.refundedMinor > 0 ? [{ label: "Refunded", value: money(totals.refundedMinor) }] : []),
          ...(totals.refundableDepositMinor > 0 ? [{ label: "Deposit to return", value: money(totals.refundableDepositMinor) }] : []),
        ]}
      />

      {!staff ? (
        <div className="flex flex-wrap gap-3">
          {actions.payNow.map((provider, index) => (
            <Button key={provider} variant={index === 0 ? "primary" : "secondary"} loading={pending} onClick={() => quick(() => payNowAction(spaceSlug, { loanId, provider }), "")}>
              {actions.payNow.length > 1 ? `Pay by ${PROVIDER_BUTTON[provider]}` : `Pay ${money(owed + totals.payLaterMinor)} now`}
            </Button>
          ))}
          {actions.payLater ? <Button disabled={pending} onClick={() => quick(() => payLaterAction(spaceSlug, { loanId }), "Marked to pay later.")}>Pay later</Button> : null}
          {actions.submitOffline ? offline("submit") : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {actions.returnDeposit ? (
            <AmountReasonDialog kind="deposit" maxMinor={actions.returnDeposit.maxMinor} currency={summary.currency} onSubmit={(deductionMinor, reason) => returnDepositAction(spaceSlug, { loanId, deductionMinor, reason })} />
          ) : null}
          {actions.recordOffline ? offline("record") : null}
          {actions.markPayLater ? <Button disabled={pending} onClick={() => quick(() => markPayLaterAction(spaceSlug, { loanId }), "Marked to pay later.")}>Mark pay later</Button> : null}
        </div>
      )}

      {summary.payments.length > 0 ? (
        <section aria-label="Payments made" className="space-y-3">
          <h4 className="text-title text-ink">Payments</h4>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {summary.payments.map((payment) => (
              <li key={payment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink tabular-nums">{money(payment.amountMinor)} · {payment.providerLabel}{payment.method && payment.method in OFFLINE_METHOD_LABEL ? `, ${OFFLINE_METHOD_LABEL[payment.method as OfflineMethod]}` : ""}</p>
                  <p className="text-caption text-ink-muted">{payment.dateLabel}{payment.reference ? ` · Ref ${payment.reference}` : ""}</p>
                  {staff && payment.note ? <p className={payment.flagged ? "text-caption text-danger-fg" : "text-caption text-ink-muted"}>{payment.note}</p> : null}
                </div>
                <Chip tone={payment.flagged ? "danger" : payment.tone} size="sm">{payment.flagged ? "Check this" : payment.statusLabel}</Chip>
                {staff && actions.confirmPaymentIds.includes(payment.id) ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" loading={pending} onClick={() => quick(() => reviewOfflinePaymentAction(spaceSlug, { paymentId: payment.id, decision: "confirm" }), "Payment confirmed.")}>Confirm received</Button>
                    <ReasonDialog trigger="Not received…" variant="dangerOutline" title="Mark as not received" description="The charges become due again and the member is told." submitLabel="Mark not received" success="Payment rejected." onSubmit={(reason) => reviewOfflinePaymentAction(spaceSlug, { paymentId: payment.id, decision: "reject", reason })} />
                  </div>
                ) : null}
                {staff && actions.refundPaymentIds.includes(payment.id) ? (
                  <AmountReasonDialog kind="refund" maxMinor={payment.refundableMinor} currency={summary.currency} onSubmit={(amountMinor, reason) => refundPaymentAction(spaceSlug, { paymentId: payment.id, amountMinor, reason })} />
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.refunds.length > 0 ? (
        <section aria-label="Refunds" className="space-y-3">
          <h4 className="text-title text-ink">Refunds</h4>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {summary.refunds.map((refund) => (
              <li key={refund.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink tabular-nums">{money(refund.amountMinor)}</p>
                  <p className="text-caption text-ink-muted">{refund.dateLabel} · {refund.reason}</p>
                  {refund.failureReason ? <p className="text-caption text-danger-fg">{refund.failureReason}</p> : null}
                </div>
                <Chip tone={refund.tone} size="sm">{refund.statusLabel}</Chip>
                {staff && refund.canRetry ? (
                  <Button loading={pending} onClick={() => quick(() => retryRefundAction(spaceSlug, { refundId: refund.id }), refund.provider === "OFFLINE" ? "Refund recorded." : "Refund sent again.")}>
                    {refund.provider === "OFFLINE" ? "Mark refunded in cash" : "Try refund again"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}
