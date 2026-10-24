"use client";

import { useState } from "react";
import { saveLocationAction } from "@/app/actions/catalogue";
import { StockDialog } from "@/components/stock/StockDialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { useRunAction } from "./useRunAction";
import { LOCATION_KIND_LABEL } from "./words";

export type LocationValues = { name: string; code: string; kind: keyof typeof LOCATION_KIND_LABEL; parentId: string; description: string };
export type ParentOption = { id: string; label: string };

/** Create or edit one location: name, short code, kind and where it sits. */
export function LocationDialog({ open, onOpenChange, slug, locationId, initial, parents }: {
  open: boolean; onOpenChange: (open: boolean) => void; slug: string; locationId: string | null; initial: LocationValues; parents: ParentOption[];
}) {
  const { pending, error, fieldErrors, run, reset } = useRunAction();
  const [values, setValues] = useState(initial);
  const set = <K extends keyof LocationValues>(key: K, value: LocationValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const fieldError = (key: string) => fieldErrors[`location.${key}`]?.[0];
  const options = parents.filter((option) => option.id !== locationId);
  return (
    <StockDialog
      open={open}
      onOpenChange={close}
      title={locationId ? "Edit location" : "Add location"}
      submitLabel={locationId ? "Save changes" : "Add location"}
      pending={pending}
      error={error}
      onSubmit={() => run(() => saveLocationAction(slug, locationId, values), locationId ? "Saved the location." : "Added the location.", () => {
        if (!locationId) setValues(initial);
        onOpenChange(false);
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" error={fieldError("name")} required>
          <Input value={values.name} maxLength={80} onChange={(event) => set("name", event.target.value)} autoFocus />
        </Field>
        <Field label="Code" helperText="Short and unique, like B1-R2-S3." error={fieldError("code")} required>
          <Input value={values.code} maxLength={24} autoCapitalize="characters" onChange={(event) => set("code", event.target.value.toUpperCase())} />
        </Field>
        <Field label="Kind">
          <Dropdown value={values.kind} onChange={(event) => set("kind", event.target.value as LocationValues["kind"])}>
            {Object.entries(LOCATION_KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Inside" error={fieldError("parentId")}>
          <Dropdown value={values.parentId} onChange={(event) => set("parentId", event.target.value)}>
            <option value="">Nothing (top level)</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Dropdown>
        </Field>
      </div>
      <Field label="Description" optional>
        <Textarea rows={2} maxLength={500} value={values.description} onChange={(event) => set("description", event.target.value)} />
      </Field>
    </StockDialog>
  );
}
