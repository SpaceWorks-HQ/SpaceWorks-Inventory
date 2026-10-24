"use client";

import { useState } from "react";
import type { FinanceCategory, FinanceDirection, PayoutMethod } from "@prisma/client";
import { createFinanceEntryAction } from "@/app/actions/finance";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { CATEGORY_LABEL, MANUAL_CATEGORIES, PAYOUT_METHODS, PAYOUT_METHOD_LABEL } from "@/lib/finance/labels";

const today = () => new Date().toISOString().slice(0, 10);

/** Other income or an expense (rent, utilities…) recorded by hand. */
export function FinanceEntryDialog({ slug, currency }: { slug: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<FinanceDirection>("OUT");
  const [category, setCategory] = useState<FinanceCategory>("RENT");
  const [form, setForm] = useState({ amount: "", reference: "", occurredOn: today(), note: "" });
  const [method, setMethod] = useState<PayoutMethod>("BANK_TRANSFER");
  const { run, pending, error } = useActionRunner();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const flip = (next: FinanceDirection) => { setDirection(next); setCategory(MANUAL_CATEGORIES[next][0]!); };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="primary">Record income or expense</Button></DialogTrigger>
      <DialogContent size="md">
        <form className="contents" onSubmit={(event) => { event.preventDefault(); void run(() => createFinanceEntryAction(slug, { direction, category, method, ...form, reference: form.reference || null }), "Entry recorded.").then((ok) => { if (ok) { setOpen(false); setForm({ amount: "", reference: "", occurredOn: today(), note: "" }); } }); }}>
          <DialogHeader title="Record income or expense" description="Loan payments, refunds, payouts and purchases are recorded on their own. Use this for everything else." />
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><SegmentedControl ariaLabel="Money in or out" value={direction} onValueChange={flip} options={[{ value: "OUT", label: "Money out" }, { value: "IN", label: "Money in" }]} /></div>
            <Field label="Category">
              <Dropdown value={category} onChange={(event) => setCategory(event.target.value as FinanceCategory)}>
                {MANUAL_CATEGORIES[direction].map((value) => <option key={value} value={value}>{CATEGORY_LABEL[value]}</option>)}
              </Dropdown>
            </Field>
            <Field label={`Amount (${currency})`}><Input inputMode="decimal" value={form.amount} onChange={set("amount")} required /></Field>
            <Field label="Method">
              <Dropdown value={method} onChange={(event) => setMethod(event.target.value as PayoutMethod)}>
                {PAYOUT_METHODS.map((value) => <option key={value} value={value}>{PAYOUT_METHOD_LABEL[value]}</option>)}
              </Dropdown>
            </Field>
            <Field label="Reference" optional={method === "CASH"}><Input value={form.reference} onChange={set("reference")} maxLength={120} required={method !== "CASH"} /></Field>
            <Field label="Date"><Input type="date" value={form.occurredOn} max={today()} onChange={set("occurredOn")} required /></Field>
            <Field label="What it was for"><Input value={form.note} onChange={set("note")} maxLength={500} required /></Field>
            {error ? <Callout tone="danger" role="alert" className="sm:col-span-2">{error}</Callout> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>Record entry</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
