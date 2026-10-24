"use client";

import { useState } from "react";
import { adjustStockAction, moveStockAction, receiveStockAction } from "@/app/actions/stock";
import { useRunAction } from "@/components/catalogue/useRunAction";
import { ADJUST_REASONS, REASON_LABEL } from "@/components/catalogue/words";
import { SegmentedControl } from "@/components/ui/choice";
import { Dropdown, Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import { parseMoneyInput } from "@/lib/format/quantity";
import { parseWhole, StockDialog, type LevelOption, type LocationOption } from "./StockDialog";

type Base = { open: boolean; onOpenChange: (open: boolean) => void; slug: string; itemId: string; unit: string | null };

function LocationField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: LocationOption[] }) {
  return (
    <Field label={label}>
      <Dropdown value={value} onChange={(event) => onChange(event.target.value)}>
        {options.length === 0 ? <option value="" disabled>Add a location first</option> : null}
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Dropdown>
    </Field>
  );
}

function NoteField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Note" optional>
      <Textarea rows={2} maxLength={500} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

/** Stock arrives at a location; a cost updates the item's average cost. */
export function ReceiveDialog({ open, onOpenChange, slug, itemId, unit, locations, currency, minorDigits }: Base & { locations: LocationOption[]; currency: string; minorDigits: number }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const qty = parseWhole(quantity);
    if (!qty) return setError("Enter a quantity above zero.");
    const unitCostMinor = parseMoneyInput(cost, minorDigits);
    if (unitCostMinor !== null && Number.isNaN(unitCostMinor)) return setError("Enter the unit cost like 12.50.");
    run(() => receiveStockAction(slug, { itemId, locationId, quantity: qty, unitCostMinor, note }), `Received ${qty}${unit ? ` ${unit}` : ""}.`, () => {
      setQuantity("");
      setCost("");
      setNote("");
      close(false);
    });
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Receive stock" description="New stock from a purchase or donation." submitLabel="Receive stock" pending={pending} error={error} onSubmit={submit}>
      <LocationField label="Put it on" value={locationId} onChange={setLocationId} options={locations} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={unit ? `Quantity (${unit})` : "Quantity"} required>
          <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
        </Field>
        <Field label="Unit cost" optional helperText="Updates the average cost.">
          <PrefixInput prefix={currency} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
        </Field>
      </div>
      <NoteField value={note} onChange={setNote} />
    </StockDialog>
  );
}

/** Correct the count at one location with a reason; decreases only take free stock. */
export function AdjustDialog({ open, onOpenChange, slug, itemId, unit, levels, locations }: Base & { levels: LevelOption[]; locations: LocationOption[] }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const options = direction === "increase" ? locations : levels.map((level) => ({ id: level.locationId, label: `${level.label} · ${level.available} free` }));
  const [locationId, setLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const chosenLocation = options.some((option) => option.id === locationId) ? locationId : (options[0]?.id ?? "");
  const reasons = ADJUST_REASONS[direction] as readonly string[];
  const chosenReason = reasons.includes(reason) ? reason : reasons[0]!;
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const qty = parseWhole(quantity);
    if (!qty) return setError("Enter a quantity above zero.");
    if (!chosenLocation) return setError("Choose a location.");
    const delta = direction === "increase" ? qty : -qty;
    run(() => adjustStockAction(slug, { itemId, locationId: chosenLocation, delta, reason: chosenReason, note }), "Adjusted the stock.", () => {
      setQuantity("");
      setNote("");
      close(false);
    });
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Adjust stock" description="Every adjustment is kept in the stock ledger with its reason." submitLabel="Adjust stock" pending={pending} error={error} onSubmit={submit}>
      <SegmentedControl ariaLabel="Direction" value={direction} onValueChange={setDirection} options={[{ value: "decrease", label: "Take away" }, { value: "increase", label: "Add" }]} />
      <LocationField label="Location" value={chosenLocation} onChange={setLocationId} options={options} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={unit ? `Quantity (${unit})` : "Quantity"} required>
          <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </Field>
        <Field label="Reason">
          <Dropdown value={chosenReason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((value) => <option key={value} value={value}>{REASON_LABEL[value]}</option>)}
          </Dropdown>
        </Field>
      </div>
      <NoteField value={note} onChange={setNote} />
    </StockDialog>
  );
}

/** Re-shelve free stock inside the space. */
export function MoveDialog({ open, onOpenChange, slug, itemId, unit, levels, locations }: Base & { levels: LevelOption[]; locations: LocationOption[] }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const sources = levels.filter((level) => level.available > 0).map((level) => ({ id: level.locationId, label: `${level.label} · ${level.available} free` }));
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const from = sources.some((option) => option.id === fromId) ? fromId : (sources[0]?.id ?? "");
  const targets = locations.filter((option) => option.id !== from);
  const to = targets.some((option) => option.id === toId) ? toId : (targets[0]?.id ?? "");
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const qty = parseWhole(quantity);
    if (!qty) return setError("Enter a quantity above zero.");
    if (!from || !to) return setError("Choose where to move it from and to.");
    run(() => moveStockAction(slug, { itemId, fromLocationId: from, toLocationId: to, quantity: qty, note }), "Moved the stock.", () => {
      setQuantity("");
      setNote("");
      close(false);
    });
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Move stock" description="Only free stock moves; held units stay where they are." submitLabel="Move stock" pending={pending} error={error} onSubmit={submit}>
      <LocationField label="From" value={from} onChange={setFromId} options={sources} />
      <LocationField label="To" value={to} onChange={setToId} options={targets} />
      <Field label={unit ? `Quantity (${unit})` : "Quantity"} required>
        <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </Field>
      <NoteField value={note} onChange={setNote} />
    </StockDialog>
  );
}
