"use client";

import { useState } from "react";
import { quarantineStockAction, resolveQuarantineAction } from "@/app/actions/stock";
import { useRunAction } from "@/components/catalogue/useRunAction";
import { SegmentedControl } from "@/components/ui/choice";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { parseWhole, StockDialog, type LevelOption } from "./StockDialog";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; slug: string; itemId: string; unit: string | null; levels: LevelOption[] };

function useLevelChoice(options: Array<{ id: string; label: string }>) {
  const [chosen, setChosen] = useState("");
  return [options.some((option) => option.id === chosen) ? chosen : (options[0]?.id ?? ""), setChosen] as const;
}

/** Put free units on the repair shelf: still on hand, but nobody can borrow or move them. */
export function QuarantineDialog({ open, onOpenChange, slug, itemId, unit, levels }: Props) {
  const { pending, error, run, reset, setError } = useRunAction();
  const options = levels.filter((level) => level.available > 0).map((level) => ({ id: level.locationId, label: `${level.label} · ${level.available} free` }));
  const [locationId, setLocationId] = useLevelChoice(options);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const qty = parseWhole(quantity);
    if (!qty) return setError("Enter a quantity above zero.");
    if (!locationId) return setError("There is no free stock to put on the repair shelf.");
    run(() => quarantineStockAction(slug, { itemId, locationId, quantity: qty, note }), "Put on the repair shelf.", () => {
      setNote("");
      close(false);
    });
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Put on the repair shelf" description="Units stay counted at their location until they are repaired or scrapped." submitLabel="Put on repair shelf" pending={pending} error={error} onSubmit={submit}>
      <Field label="Location">
        <Dropdown value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {options.length === 0 ? <option value="" disabled>No free stock</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
      <Field label={unit ? `Quantity (${unit})` : "Quantity"} required>
        <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </Field>
      <Field label="What's wrong" optional>
        <Textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </StockDialog>
  );
}

/** Take units off the repair shelf: repaired units are free again, scrapped units are written off. */
export function ResolveRepairDialog({ open, onOpenChange, slug, itemId, unit, levels, initialOutcome = "repair" }: Props & { initialOutcome?: "repair" | "scrap" }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const options = levels.filter((level) => level.quarantined > 0).map((level) => ({ id: level.locationId, label: `${level.label} · ${level.quarantined} under repair` }));
  const [locationId, setLocationId] = useLevelChoice(options);
  const [outcome, setOutcome] = useState<"repair" | "scrap">(initialOutcome);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const qty = parseWhole(quantity);
    if (!qty) return setError("Enter a quantity above zero.");
    if (!locationId) return setError("Nothing is on the repair shelf.");
    run(() => resolveQuarantineAction(slug, { itemId, locationId, quantity: qty, outcome, note }), outcome === "repair" ? "Marked as repaired." : "Scrapped and written off.", () => {
      setNote("");
      close(false);
    });
  };
  return (
    <StockDialog
      open={open}
      onOpenChange={close}
      title="Take off the repair shelf"
      description={outcome === "scrap" ? "Scrapped units leave the books for good." : "Repaired units become free to lend and move."}
      submitLabel={outcome === "repair" ? "Mark repaired" : "Scrap units"}
      destructive={outcome === "scrap"}
      pending={pending}
      error={error}
      onSubmit={submit}
    >
      <SegmentedControl ariaLabel="Outcome" value={outcome} onValueChange={setOutcome} options={[{ value: "repair", label: "Repaired" }, { value: "scrap", label: "Scrap" }]} />
      <Field label="Location">
        <Dropdown value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {options.length === 0 ? <option value="" disabled>Nothing under repair</option> : null}
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
      <Field label={unit ? `Quantity (${unit})` : "Quantity"} required>
        <Input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      </Field>
      <Field label="Note" optional>
        <Textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
    </StockDialog>
  );
}
