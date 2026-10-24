import { CheckboxField } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { FilterForm } from "./FilterForm";

type Values = { q: string; categoryId: string; tracking: string; lendable: string; low: boolean; archived: boolean };

/** Search and filters for the items list (kept in the URL). */
export function ItemFilters({ action, values, categories }: { action: string; values: Values; categories: Array<{ id: string; name: string }> }) {
  return (
    <FilterForm action={action} label="Filter items">
      <Field label="Search" className="sm:col-span-2">
        <Input name="q" type="search" defaultValue={values.q} placeholder="Name, SKU, barcode or tag" />
      </Field>
      <Field label="Category">
        <Dropdown name="category" defaultValue={values.categoryId}>
          <option value="">All categories</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Dropdown>
      </Field>
      <Field label="Tracking">
        <Dropdown name="tracking" defaultValue={values.tracking}>
          <option value="">Any tracking</option>
          <option value="QUANTITY">By quantity</option>
          <option value="SERIALIZED">Serialized</option>
        </Dropdown>
      </Field>
      <Field label="Lending">
        <Dropdown name="lendable" defaultValue={values.lendable}>
          <option value="">Lendable or not</option>
          <option value="yes">Lendable</option>
          <option value="no">Not lendable</option>
        </Dropdown>
      </Field>
      <CheckboxField name="low" value="1" defaultChecked={values.low} label="Low stock only" />
      <CheckboxField name="archived" value="1" defaultChecked={values.archived} label="Include archived" />
    </FilterForm>
  );
}
