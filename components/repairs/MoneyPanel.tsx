"use client";

import { useState } from "react";
import type { PayoutMethod } from "@prisma/client";
import { approveRepairAmountAction, recordRepairPayoutAction } from "@/app/actions/repairs";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, DetailList } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { PAYOUT_METHODS, PAYOUT_METHOD_LABEL } from "@/lib/finance/labels";
import { currencyMinorDigits, formatMoney } from "@/lib/format/money";
import { moneyInputValue } from "@/lib/format/quantity";
import type { RepairDetail } from "@/lib/repairs/views";
import { PayoutChip } from "./RepairChips";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Money for a repair. Inventory managers approve the amount and record
 * payouts (partial payouts allowed); the assigned technician sees only the
 * amount they asked and whether it is paid.
 */
export function MoneyPanel({ slug, currency, repair, pay }: { slug: string; currency: string; repair: RepairDetail; pay: boolean }) {
  const money = repair.money!;
  const digits = currencyMinorDigits(currency);
  const [approve, setApprove] = useState(moneyInputValue(money.approvedMinor ?? money.askedMinor, digits));
  const [note, setNote] = useState("");
  const left = money.approvedMinor !== null && money.paidMinor !== null ? money.approvedMinor - money.paidMinor : 0;
  const [amount, setAmount] = useState(moneyInputValue(left > 0 ? left : null, digits));
  const [method, setMethod] = useState<PayoutMethod>("UPI");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(today());
  const { run, pending, error } = useActionRunner();
  const issueId = repair.id;
  const canApprove = pay && (repair.status === "FIXED" || repair.status === "CLOSED") && repair.technician;
  const canPay = pay && money.approvedMinor !== null && left > 0 && repair.status !== "CANCELLED";

  return (
    <Card as="section" aria-label="Payment">
      <CardHeader title="Payment" titleAs="h2" />
      <div className="flex flex-col gap-4">
        <DetailList
          items={[
            { label: "Asked", value: money.askedMinor !== null ? formatMoney(money.askedMinor, currency) : "Not yet" },
            ...(pay ? [{ label: "Approved", value: money.approvedMinor !== null ? formatMoney(money.approvedMinor, currency) : "Not yet" }, { label: "Paid", value: formatMoney(money.paidMinor ?? 0, currency) }] : []),
            { label: "Status", value: <PayoutChip state={money.payout} /> },
          ]}
        />
        {money.approvalNote ? <p className="text-caption text-ink-muted">Approval note: {money.approvalNote}</p> : null}
        {pay && money.payouts.length ? (
          <ul className="flex flex-col gap-2 text-body-ui" aria-label="Payouts">
            {money.payouts.map((payout) => <li key={payout.id}><span className="font-semibold tabular-nums">{formatMoney(payout.amountMinor, currency)}</span> · {PAYOUT_METHOD_LABEL[payout.method]}{payout.reference ? ` · ${payout.reference}` : ""} · {payout.paidLabel}</li>)}
          </ul>
        ) : null}
        {canApprove ? (
          <form className="flex flex-col gap-3 border-t border-line pt-4" onSubmit={(event) => { event.preventDefault(); void run(() => approveRepairAmountAction(slug, { issueId, amount: approve, note: note || null }), "Amount approved."); }}>
            <Field label={`Approve (${currency})`}><Input inputMode="decimal" value={approve} onChange={(event) => setApprove(event.target.value)} required /></Field>
            <Field label="Reason" optional helperText="Needed when it differs from what was asked."><Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} /></Field>
            <Button type="submit" variant={money.approvedMinor === null ? "primary" : "secondary"} loading={pending}>{money.approvedMinor === null ? "Approve amount" : "Change approved amount"}</Button>
          </form>
        ) : null}
        {canPay ? (
          <form className="flex flex-col gap-3 border-t border-line pt-4" onSubmit={(event) => { event.preventDefault(); void run(() => recordRepairPayoutAction(slug, { issueId, amount, method, reference: reference || null, paidOn, note: null }), "Payout recorded."); }}>
            <Field label={`Pay (${currency})`} helperText={`${formatMoney(left, currency)} left to pay.`}><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
            <Field label="Paid by">
              <Dropdown value={method} onChange={(event) => setMethod(event.target.value as PayoutMethod)}>
                {PAYOUT_METHODS.map((value) => <option key={value} value={value}>{PAYOUT_METHOD_LABEL[value]}</option>)}
              </Dropdown>
            </Field>
            <Field label="Reference" optional={method === "CASH"} helperText="UTR, transaction or cheque number."><Input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} required={method !== "CASH"} /></Field>
            <Field label="Paid on"><Input type="date" value={paidOn} max={today()} onChange={(event) => setPaidOn(event.target.value)} required /></Field>
            <Button type="submit" variant="primary" loading={pending}>Record payout</Button>
          </form>
        ) : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </div>
    </Card>
  );
}
