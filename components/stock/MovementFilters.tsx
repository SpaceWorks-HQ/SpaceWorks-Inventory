import { FilterForm } from "@/components/catalogue/FilterForm";
import { MOVEMENT_LABEL } from "@/components/catalogue/words";
import { Dropdown, Field, Input } from "@/components/ui/field";

type Values = { type: string; itemId: string; assetId: string; q: string; from: string; to: string; ref: string };

/** Ledger filters: type, item, dates in the space time zone and a reference such as LN-0042. */
export function MovementFilters({ action, values, itemLabel }: { action: string; values: Values; itemLabel: string | null }) {
  return (
    <FilterForm action={action} label="Filter the ledger">
      {values.itemId ? <input type="hidden" name="item" value={values.itemId} /> : null}
      {values.assetId ? <input type="hidden" name="asset" value={values.assetId} /> : null}
      <Field label="Item" helperText={itemLabel ? `Showing ${itemLabel} only.` : undefined}>
        <Input name="q" type="search" defaultValue={values.q} placeholder="Name or SKU" />
      </Field>
      <Field label="Type">
        <Dropdown name="type" defaultValue={values.type}>
          <option value="">Every type</option>
          {Object.entries(MOVEMENT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Dropdown>
      </Field>
      <Field label="From">
        <Input name="from" type="date" defaultValue={values.from} />
      </Field>
      <Field label="To">
        <Input name="to" type="date" defaultValue={values.to} />
      </Field>
      <Field label="Reference" helperText="LN-0042, TR-0007, CC-0003 or PO-0011">
        <Input name="ref" type="text" defaultValue={values.ref} />
      </Field>
    </FilterForm>
  );
}
