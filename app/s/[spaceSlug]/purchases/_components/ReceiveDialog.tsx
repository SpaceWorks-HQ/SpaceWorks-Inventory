"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receivePurchaseAction } from "@/app/actions/purchases";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { currencyMinorDigits } from "@/lib/format/money";
import { moneyInputValue } from "@/lib/format/quantity";
import { emptyPayment, PaymentFields, paymentInput } from "./PaymentFields";
import type { PurchaseRow } from "./PurchasesTable";

/** Receive a delivery into stock at one location. A purchase that skipped "ordered" records what it cost here. */
export function ReceiveDialog({ slug, currency, purchase, locations, suppliers, onClose }: { slug: string; currency: string; purchase: PurchaseRow; locations: { id: string; label: string }[]; suppliers: { id: string; name: string }[]; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [quantity, setQuantity] = useState(String(purchase.quantity));
  const [unitCost, setUnitCost] = useState(moneyInputValue(purchase.unitCostMinor, currencyMinorDigits(currency)));
  const [tracking, setTracking] = useState<"QUANTITY" | "SERIALIZED">("QUANTITY");
  const [payment, setPayment] = useState(emptyPayment(purchase.supplierId));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await receivePurchaseAction(slug, { purchaseId: purchase.id, locationId, quantity: Number(quantity) || 0, unitCost, tracking: purchase.linked ? undefined : tracking, payment: purchase.paid ? undefined : paymentInput(payment) });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        showToast(result.error, "error");
        return;
      }
      showToast(`${purchase.reference} received into stock.`, "success");
      onClose();
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(next) => (!next && !pending ? onClose() : undefined)}>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader title={`Receive ${purchase.reference}`} description={`${purchase.name}: record what arrived and where it went.`} />
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            {locations.length === 0 ? (
              <Callout tone="warning" className="sm:col-span-2">Add a location first, then receive the delivery.</Callout>
            ) : (
              <Field label="Put it on" className="sm:col-span-2" error={errors.locationId?.[0]}>
                <Dropdown value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
                </Dropdown>
              </Field>
            )}
            <Field label="Quantity received" error={errors.quantity?.[0]}>
              <Input type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
            </Field>
            <Field label={`Unit cost (${currency})`} optional error={errors.unitCost?.[0]} helperText="Updates the average cost used for valuation.">
              <Input inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} placeholder="0.00" />
            </Field>
            {purchase.paid ? null : <PaymentFields currency={currency} value={payment} onChange={setPayment} suppliers={suppliers} errors={errors} />}
            {purchase.linked ? null : (
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 text-label text-ink">How to track the new item</legend>
                <RadioGroup value={tracking} onValueChange={(value) => setTracking(value as "QUANTITY" | "SERIALIZED")}>
                  <Radio value="QUANTITY" label="By quantity" description="Parts and consumables counted per shelf." />
                  <Radio value="SERIALIZED" label="One by one" description="Tools that each get their own QR tag." />
                </RadioGroup>
              </fieldset>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={locations.length === 0}>Receive into stock</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
