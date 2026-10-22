"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import { currencyMinorDigits, formatMoney, parseMoneyToMinor } from "@/lib/format/money";
import { OFFLINE_METHOD_LABEL, OFFLINE_METHODS, type OfflineMethod } from "@/lib/payments/types";

type Result = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** A trigger button and a small form dialog that runs one action, toasts the outcome and refreshes. */
function ActionDialog({ trigger, variant = "secondary", title, description, submitLabel, success, run, children }: {
  trigger: string;
  variant?: ButtonVariant;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  success: string;
  run: () => Promise<Result>;
  children: (error: (field: string) => string | undefined) => ReactNode;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      const result = await run();
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        showToast(result.error, "error");
        return;
      }
      setErrors({});
      setOpen(false);
      showToast(success, "success");
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant={variant}>{trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }} className="flex min-h-0 flex-col">
          <DialogHeader title={title} description={description} />
          <DialogBody className="flex flex-col gap-4">{children((field) => errors[field]?.[0])}</DialogBody>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OfflinePaymentDialog({ mode, amountMinor, currency, instructions, onSubmit }: {
  mode: "submit" | "record";
  amountMinor: number;
  currency: string;
  instructions: string | null;
  onSubmit: (input: { method: OfflineMethod; reference: string; note: string }) => Promise<Result>;
}) {
  const [method, setMethod] = useState<OfflineMethod>(mode === "record" ? "cash" : "upi");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const amount = formatMoney(amountMinor, currency);
  return (
    <ActionDialog
      trigger={mode === "record" ? "Record payment…" : "I paid offline…"}
      title={mode === "record" ? `Record ${amount} received` : `Tell staff you paid ${amount}`}
      description={mode === "record" ? "Everything due on this loan is marked paid." : "Staff confirm the payment when it reaches the space."}
      submitLabel={mode === "record" ? "Record payment" : "Send for confirmation"}
      success={mode === "record" ? "Payment recorded." : "Sent. Staff will confirm it."}
      run={() => onSubmit({ method, reference, note })}
    >
      {(error) => (
        <>
          {mode === "submit" && instructions ? <p className="whitespace-pre-line rounded-lg border border-line bg-surface p-3 text-body-ui text-ink">{instructions}</p> : null}
          <Field label="How" error={error("method")}>
            <Dropdown value={method} onChange={(e) => setMethod(e.target.value as OfflineMethod)}>
              {OFFLINE_METHODS.map((value) => <option key={value} value={value}>{OFFLINE_METHOD_LABEL[value]}</option>)}
            </Dropdown>
          </Field>
          <Field label="Reference" optional={method === "cash"} helperText="UPI or bank transaction id, or the receipt number." error={error("reference")}>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Note" optional error={error("note")}>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
        </>
      )}
    </ActionDialog>
  );
}

export function ReasonDialog({ trigger, title, description, submitLabel, success, variant, onSubmit }: {
  trigger: string;
  title: string;
  description?: string;
  submitLabel: string;
  success: string;
  variant?: ButtonVariant;
  onSubmit: (reason: string) => Promise<Result>;
}) {
  const [reason, setReason] = useState("");
  return (
    <ActionDialog trigger={trigger} variant={variant} title={title} description={description} submitLabel={submitLabel} success={success} run={() => onSubmit(reason)}>
      {(error) => (
        <Field label="Reason" error={error("reason")} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
        </Field>
      )}
    </ActionDialog>
  );
}

/** Return a deposit in full, or keep part of it with a reason; also used to refund a flagged payment. */
export function AmountReasonDialog({ kind, maxMinor, currency, onSubmit }: {
  kind: "deposit" | "refund";
  maxMinor: number;
  currency: string;
  onSubmit: (amountMinor: number, reason: string) => Promise<Result>;
}) {
  const [amount, setAmount] = useState(kind === "refund" ? (maxMinor / 10 ** currencyMinorDigits(currency)).toFixed(currencyMinorDigits(currency)) : "");
  const [reason, setReason] = useState("");
  const [invalid, setInvalid] = useState<string | undefined>();
  const max = formatMoney(maxMinor, currency);
  const run = async (): Promise<Result> => {
    const minor = amount.trim() === "" ? 0 : parseMoneyToMinor(amount, currency);
    if (minor === null || minor > maxMinor) {
      setInvalid(`Enter an amount up to ${max}.`);
      return { ok: false, error: `Enter an amount up to ${max}.` };
    }
    setInvalid(undefined);
    return onSubmit(minor, reason);
  };
  return (
    <ActionDialog
      trigger={kind === "deposit" ? "Return deposit…" : "Refund…"}
      variant={kind === "deposit" ? "primary" : "secondary"}
      title={kind === "deposit" ? `Return the ${max} deposit` : "Refund this payment"}
      description={kind === "deposit" ? "Leave the amount kept empty to return it all. Online payments go back to the card or account they came from." : `Up to ${max} can be refunded.`}
      submitLabel={kind === "deposit" ? "Return deposit" : "Refund"}
      success={kind === "deposit" ? "Deposit return recorded." : "Refund started."}
      run={run}
    >
      {(error) => (
        <>
          <Field label={kind === "deposit" ? "Amount kept" : "Amount to refund"} optional={kind === "deposit"} error={invalid ?? error("deductionMinor") ?? error("amountMinor")}>
            <PrefixInput prefix={currency} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoComplete="off" />
          </Field>
          <Field label="Reason" optional={kind === "deposit" && !amount.trim()} helperText={kind === "deposit" ? "Needed when you keep part of the deposit, e.g. damage." : undefined} error={error("reason")}>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500} />
          </Field>
        </>
      )}
    </ActionDialog>
  );
}
