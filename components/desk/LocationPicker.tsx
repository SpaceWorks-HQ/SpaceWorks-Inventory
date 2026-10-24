"use client";

import { Dropdown, Field } from "@/components/ui/field";

export type LocationOption = { id: string; path: string; code: string };

/** Choose a shelf or bin of this space by its full path. */
export function LocationPicker({ locations, value, onChange, label = "Location", helper, optionalLabel, disabled }: {
  locations: LocationOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
  helper?: string;
  /** When set, offers a blank first option with this text. */
  optionalLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Field label={label} helperText={helper} optional={Boolean(optionalLabel)}>
      <Dropdown value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
        {optionalLabel ? <option value="">{optionalLabel}</option> : null}
        {!optionalLabel && !value ? <option value="" disabled>Choose a location</option> : null}
        {locations.map((location) => <option key={location.id} value={location.id}>{`${location.path} (${location.code})`}</option>)}
      </Dropdown>
    </Field>
  );
}
