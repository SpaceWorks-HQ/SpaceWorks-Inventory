"use client";

import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Dropdown, Field } from "@/components/ui/field";

export type ReturnLineView = { id: string; name: string; label: string; outstanding: number; serialized: boolean; locationId: string | null };
export type ReturnLineState = { returned: number; damaged: number; lost: number; locationId: string };

type Outcome = "out" | "returned" | "damaged" | "lost";

const outcomeOf = (state: ReturnLineState): Outcome => (state.lost ? "lost" : state.damaged ? "damaged" : state.returned ? "returned" : "out");

/** One outstanding line at the return desk: what came back, in what state, and where it goes. */
export function ReturnLineRow({ line, state, onChange, locations }: { line: ReturnLineView; state: ReturnLineState; onChange: (next: ReturnLineState) => void; locations: LocationOption[] }) {
  const total = state.returned + state.damaged + state.lost;
  const physical = state.returned + state.damaged > 0;
  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label text-ink">{line.label}</span>
        <span className="text-caption tabular-nums text-ink-muted">{line.outstanding} still out</span>
      </div>
      {line.serialized ? (
        <Field label={`What happened to ${line.label}`} hideLabel>
          <Dropdown value={outcomeOf(state)} onChange={(event) => {
            const outcome = event.target.value as Outcome;
            onChange({ ...state, returned: outcome === "returned" ? 1 : 0, damaged: outcome === "damaged" ? 1 : 0, lost: outcome === "lost" ? 1 : 0 });
          }}>
            <option value="out">Still out</option>
            <option value="returned">Returned in good condition</option>
            <option value="damaged">Returned damaged</option>
            <option value="lost">Lost</option>
          </Dropdown>
        </Field>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:max-w-md">
          {(["returned", "damaged", "lost"] as const).map((key) => (
            <label key={key} className="flex flex-col gap-1 text-caption text-ink-muted">
              {key === "returned" ? "Good" : key === "damaged" ? "Damaged" : "Lost"}
              <QuantityInput label={`${key} units of ${line.name}`} value={state[key]} max={line.outstanding - total + state[key]} onChange={(value) => onChange({ ...state, [key]: value })} className="w-full" />
            </label>
          ))}
        </div>
      )}
      {physical ? <LocationPicker locations={locations} value={state.locationId} onChange={(locationId) => onChange({ ...state, locationId })} label="Put back at" helper={line.locationId ? "Defaults to where it came from." : undefined} /> : null}
    </li>
  );
}
