"use client";

import type { PayoutMethod } from "@prisma/client";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { PAYOUT_METHODS, PAYOUT_METHOD_LABEL } from "@/lib/finance/labels";

export type PaymentState = { amount: string; method: PayoutMethod; reference: string; supplierId: string };

export function emptyPayment(supplierId: string | null): PaymentState {
  return { amount: "", method: "BANK_TRANSFER", reference: "", supplierId: supplierId ?? "" };
}

export function paymentInput(state: PaymentState) {
  return { amount: state.amount, method: state.method, reference: state.reference || null, supplierId: state.supplierId || null };
}

/** What a purchase actually cost: amount, how it was paid, the reference and the supplier (all go to the finance ledger). */
export function PaymentFields({ currency, value, onChange, suppliers, errors }: { currency: string; value: PaymentState; onChange: (next: PaymentState) => void; suppliers: { id: string; name: string }[]; errors: Record<string, string[]> }) {
  const set = (patch: Partial<PaymentState>) => onChange({ ...value, ...patch });
  return (
    <>
      <Field label={`Amount spent (${currency})`} error={errors.amount?.[0]} helperText="The total paid, delivery included.">
        <Input inputMode="decimal" value={value.amount} onChange={(event) => set({ amount: event.target.value })} placeholder="0.00" required />
      </Field>
      <Field label="Paid by">
        <Dropdown value={value.method} onChange={(event) => set({ method: event.target.value as PayoutMethod })}>
          {PAYOUT_METHODS.map((method) => <option key={method} value={method}>{PAYOUT_METHOD_LABEL[method]}</option>)}
        </Dropdown>
      </Field>
      <Field label="Reference" optional={value.method === "CASH"} error={errors.reference?.[0]} helperText="Invoice, UTR or transaction number.">
        <Input value={value.reference} onChange={(event) => set({ reference: event.target.value })} maxLength={120} required={value.method !== "CASH"} />
      </Field>
      <Field label="Supplier" error={errors.supplierId?.[0]}>
        <Dropdown value={value.supplierId} onChange={(event) => set({ supplierId: event.target.value })} required>
          <option value="">Choose a supplier</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </Dropdown>
      </Field>
    </>
  );
}
