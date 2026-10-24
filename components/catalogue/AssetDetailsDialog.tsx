"use client";

import { useState } from "react";
import { updateAssetAction } from "@/app/actions/catalogue";
import { StockDialog } from "@/components/stock/StockDialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { useRunAction } from "./useRunAction";
import { CONDITION_LABEL } from "./words";

export type AssetDetails = { serialNumber: string; notes: string; warrantyUntil: string; condition: keyof typeof CONDITION_LABEL };

/** Serial number, condition, warranty and notes of one asset. */
export function AssetDetailsDialog({ open, onOpenChange, slug, assetId, initial }: { open: boolean; onOpenChange: (open: boolean) => void; slug: string; assetId: string; initial: AssetDetails }) {
  const { pending, error, run, reset } = useRunAction();
  const [values, setValues] = useState(initial);
  const set = <K extends keyof AssetDetails>(key: K, value: AssetDetails[K]) => setValues((current) => ({ ...current, [key]: value }));
  const close = (next: boolean) => {
    if (!next) {
      reset();
      setValues(initial);
    }
    onOpenChange(next);
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Edit asset details" submitLabel="Save changes" pending={pending} error={error} onSubmit={() => run(() => updateAssetAction(slug, { assetId, ...values }), "Saved the asset.", () => onOpenChange(false))}>
      <Field label="Serial number" optional>
        <Input value={values.serialNumber} maxLength={80} onChange={(event) => set("serialNumber", event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Condition">
          <Dropdown value={values.condition} onChange={(event) => set("condition", event.target.value as AssetDetails["condition"])}>
            {Object.entries(CONDITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Warranty until" optional>
          <Input type="date" value={values.warrantyUntil} onChange={(event) => set("warrantyUntil", event.target.value)} />
        </Field>
      </div>
      <Field label="Notes" optional>
        <Textarea rows={3} maxLength={2000} value={values.notes} onChange={(event) => set("notes", event.target.value)} />
      </Field>
    </StockDialog>
  );
}
