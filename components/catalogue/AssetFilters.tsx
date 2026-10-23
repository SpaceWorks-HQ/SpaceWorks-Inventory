import { Dropdown, Field, Input } from "@/components/ui/field";
import { FilterForm } from "./FilterForm";

type Option = { id: string; label: string };
type Values = { q: string; status: string; itemId: string; locationId: string };

const STATUSES = [["AVAILABLE", "Available"], ["RESERVED", "Held"], ["ON_LOAN", "On loan"], ["IN_TRANSIT", "In transit"], ["MAINTENANCE", "Under repair"], ["LOST", "Lost"], ["RETIRED", "Retired"]] as const;

/** Tag or serial search, status, item and location filters for the assets list. */
export function AssetFilters({ action, values, items, locations }: { action: string; values: Values; items: Option[]; locations: Option[] }) {
  return (
    <FilterForm action={action} label="Filter assets">
      <Field label="Search">
        <Input name="q" type="search" defaultValue={values.q} placeholder="Asset tag or serial number" />
      </Field>
      <Field label="Status">
        <Dropdown name="status" defaultValue={values.status}>
          <option value="">Not retired</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Dropdown>
      </Field>
      <Field label="Item">
        <Dropdown name="item" defaultValue={values.itemId}>
          <option value="">Every item</option>
          {items.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
      <Field label="Location">
        <Dropdown name="location" defaultValue={values.locationId}>
          <option value="">Every location</option>
          {locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
    </FilterForm>
  );
}
