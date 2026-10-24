"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { saveKitAction } from "@/app/actions/catalogue";
import { StockDialog } from "@/components/stock/StockDialog";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { useRunAction } from "./useRunAction";

export type KitValues = { name: string; description: string; lendable: boolean; lines: Array<{ itemId: string; quantity: string }> };

/** Create or edit a kit: a named bundle of items members request in one go. */
export function KitDialog({ open, onOpenChange, slug, kitId, initial, items }: {
  open: boolean; onOpenChange: (open: boolean) => void; slug: string; kitId: string | null; initial: KitValues; items: Array<{ id: string; label: string }>;
}) {
  const { pending, error, run, reset, setError } = useRunAction();
  const [values, setValues] = useState(initial);
  const setLine = (index: number, patch: Partial<KitValues["lines"][number]>) =>
    setValues((current) => ({ ...current, lines: current.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const lines = values.lines.filter((line) => line.itemId).map((line) => ({ itemId: line.itemId, quantity: /^\d{1,3}$/.test(line.quantity.trim()) ? Number(line.quantity.trim()) : 0 }));
    if (lines.length === 0) return setError("Add at least one item.");
    if (lines.some((line) => line.quantity < 1)) return setError("Give each item a quantity from 1 to 999.");
    run(() => saveKitAction(slug, kitId, { name: values.name, description: values.description, lendable: values.lendable, lines }), kitId ? "Saved the kit." : "Added the kit.", () => onOpenChange(false));
  };
  return (
    <StockDialog open={open} onOpenChange={close} title={kitId ? "Edit kit" : "Add kit"} submitLabel={kitId ? "Save changes" : "Add kit"} pending={pending} error={error} onSubmit={submit}>
      <Field label="Name" required>
        <Input value={values.name} maxLength={80} onChange={(event) => setValues({ ...values, name: event.target.value })} autoFocus />
      </Field>
      <Field label="Description" optional>
        <Textarea rows={2} maxLength={500} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} />
      </Field>
      <SwitchRow checked={values.lendable} onCheckedChange={(lendable) => setValues({ ...values, lendable })} label="Members can borrow it" />
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-label text-ink">Items in the kit</legend>
        {values.lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_88px_auto] items-end gap-2">
            <Field label={`Item ${index + 1}`} hideLabel>
              <Dropdown value={line.itemId} onChange={(event) => setLine(index, { itemId: event.target.value })}>
                <option value="" disabled>Choose an item</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </Dropdown>
            </Field>
            <Field label={`Quantity of item ${index + 1}`} hideLabel>
              <Input inputMode="numeric" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
            </Field>
            <Button variant="dangerQuiet" size="sm" aria-label={`Remove item ${index + 1}`} onClick={() => setValues((current) => ({ ...current, lines: current.lines.filter((_, i) => i !== index) }))}>Remove</Button>
          </div>
        ))}
        <div>
          <Button variant="ghost" size="sm" startIcon={<Plus />} disabled={values.lines.length >= 50} onClick={() => setValues((current) => ({ ...current, lines: [...current.lines, { itemId: "", quantity: "1" }] }))}>Add an item</Button>
        </div>
      </fieldset>
    </StockDialog>
  );
}
