"use client";

import { useState } from "react";
import { createAssetsAction } from "@/app/actions/catalogue";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import { parseMoneyInput } from "@/lib/format/quantity";
import { useRunAction } from "./useRunAction";
import { CONDITION_LABEL } from "./words";

/** Register units of a serialized item: a count, or one unit per serial number. Each gets a tag and a QR code. */
export function AddAssetsForm({ slug, itemId, locations, currency, minorDigits }: { slug: string; itemId: string; locations: Array<{ id: string; label: string }>; currency: string; minorDigits: number }) {
  const { pending, error, run, setError } = useRunAction();
  const [mode, setMode] = useState<"count" | "serials">("count");
  const [count, setCount] = useState("1");
  const [serials, setSerials] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState<keyof typeof CONDITION_LABEL>("NEW");
  const [purchasedAt, setPurchasedAt] = useState("");
  const serialList = serials.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  const submit = () => {
    const amount = mode === "count" ? Number(count) : serialList.length;
    if (!Number.isInteger(amount) || amount < 1 || amount > 200) return setError(mode === "count" ? "Enter between 1 and 200 units." : "Enter between 1 and 200 serial numbers, one per line.");
    if (!locationId) return setError("Choose where the units are.");
    const purchaseCostMinor = parseMoneyInput(cost, minorDigits);
    if (purchaseCostMinor !== null && Number.isNaN(purchaseCostMinor)) return setError("Enter the cost like 12.50.");
    const input = { itemId, locationId, count: amount, serialNumbers: mode === "serials" ? serialList : [], purchaseCostMinor, condition, purchasedAt: purchasedAt || null };
    run(() => createAssetsAction(slug, input), (data) => `Added ${data?.count ?? amount} ${data?.count === 1 ? "unit" : "units"}.`, () => {
      setSerials("");
      setCount("1");
    });
  };

  if (locations.length === 0) return <p className="text-body-ui text-ink-muted">Add a location first, then register units on it.</p>;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error ? <Callout tone="danger" role="alert" title={error} /> : null}
      <SegmentedControl ariaLabel="How to add units" value={mode} onValueChange={setMode} options={[{ value: "count", label: "A number of units" }, { value: "serials", label: "Serial numbers" }]} />
      <div className="grid gap-4 sm:grid-cols-2">
        {mode === "count" ? (
          <Field label="Units" required>
            <Input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} />
          </Field>
        ) : (
          <Field label="Serial numbers" helperText={`One per line · ${serialList.length} entered`} className="sm:col-span-2">
            <Textarea rows={4} value={serials} onChange={(event) => setSerials(event.target.value)} />
          </Field>
        )}
        <Field label="Location">
          <Dropdown value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            {locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Cost per unit" optional helperText="Empty uses the item's unit cost.">
          <PrefixInput prefix={currency} inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} />
        </Field>
        <Field label="Condition">
          <Dropdown value={condition} onChange={(event) => setCondition(event.target.value as keyof typeof CONDITION_LABEL)}>
            {Object.entries(CONDITION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Bought on" optional>
          <Input type="date" value={purchasedAt} onChange={(event) => setPurchasedAt(event.target.value)} />
        </Field>
      </div>
      <div>
        <Button type="submit" variant="secondary" loading={pending}>Add units</Button>
      </div>
    </form>
  );
}
