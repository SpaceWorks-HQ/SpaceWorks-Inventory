import { FilterForm } from "@/components/catalogue/FilterForm";
import { Dropdown, Field, Input } from "@/components/ui/field";

/** Location (with everything inside it) and item search for the balances view. */
export function StockFilters({ action, q, locationId, locations }: { action: string; q: string; locationId: string; locations: Array<{ id: string; label: string }> }) {
  return (
    <FilterForm action={action} label="Filter stock">
      <Field label="Item" className="sm:col-span-2">
        <Input name="q" type="search" defaultValue={q} placeholder="Name or SKU" />
      </Field>
      <Field label="Location" className="lg:col-span-1">
        <Dropdown name="location" defaultValue={locationId}>
          <option value="">Every location</option>
          {locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
    </FilterForm>
  );
}
