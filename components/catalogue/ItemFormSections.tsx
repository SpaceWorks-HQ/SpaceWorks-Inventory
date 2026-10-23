"use client";

import type { ReactNode } from "react";
import { CheckboxField, SwitchRow } from "@/components/ui/choice";
import { Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import type { ItemFormValues } from "./itemFormModel";
import { QuickAddDialog } from "./QuickAddDialog";
import { RENTAL_MODE_LABEL } from "./words";

export type Option = { id: string; label: string };
type SectionProps = {
  values: ItemFormValues;
  set: <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => void;
  errors: Record<string, string>;
};

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

export function BasicsSection({ values, set, errors, slug, categories, units, suppliers, trackingLocked, onOptionAdded }: SectionProps & {
  slug: string; categories: Option[]; units: Option[]; suppliers: Option[]; trackingLocked: boolean; onOptionAdded: (kind: "category" | "unit", option: Option) => void;
}) {
  return (
    <Card padding="lg">
      <CardHeader title="Basics" description="What the item is and how it is counted." />
      <div className="flex flex-col gap-4">
        <Grid>
          <Field label="Name" error={errors.name} required>
            <Input value={values.name} onChange={(e) => set("name", e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="SKU" optional helperText="Leave empty to make one from the name." error={errors.sku}>
            <Input value={values.sku} onChange={(e) => set("sku", e.target.value)} maxLength={40} autoCapitalize="characters" />
          </Field>
        </Grid>
        <Field label="Description" optional error={errors.description}>
          <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={3} />
        </Field>
        <Field label="Tracking" helperText={trackingLocked ? "Tracking can't change once the item has stock history." : "Serialized items get one QR-tagged asset per physical unit."} error={errors.tracking}>
          <Dropdown value={values.tracking} onChange={(e) => set("tracking", e.target.value as ItemFormValues["tracking"])} disabled={trackingLocked}>
            <option value="QUANTITY">By quantity (parts, consumables, identical tools)</option>
            <option value="SERIALIZED">One by one (each unit has its own tag)</option>
          </Dropdown>
        </Field>
        <Grid>
          <div className="flex flex-col gap-1">
            <Field label="Category" optional error={errors.categoryId}>
              <Dropdown value={values.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                <option value="">No category</option>
                {categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Dropdown>
            </Field>
            <div><QuickAddDialog slug={slug} kind="category" onAdded={(option) => onOptionAdded("category", option)} /></div>
          </div>
          <div className="flex flex-col gap-1">
            <Field label="Unit" optional error={errors.unitId}>
              <Dropdown value={values.unitId} onChange={(e) => set("unitId", e.target.value)}>
                <option value="">No unit</option>
                {units.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </Dropdown>
            </Field>
            <div><QuickAddDialog slug={slug} kind="unit" onAdded={(option) => onOptionAdded("unit", option)} /></div>
          </div>
          <Field label="Supplier" optional error={errors.supplierId}>
            <Dropdown value={values.supplierId} onChange={(e) => set("supplierId", e.target.value)}>
              <option value="">No supplier</option>
              {suppliers.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </Dropdown>
          </Field>
          <Field label="Barcode" optional error={errors.barcode}>
            <Input value={values.barcode} onChange={(e) => set("barcode", e.target.value)} maxLength={64} />
          </Field>
          <Field label="Brand" optional error={errors.brand}>
            <Input value={values.brand} onChange={(e) => set("brand", e.target.value)} maxLength={80} />
          </Field>
          <Field label="Model" optional error={errors.model}>
            <Input value={values.model} onChange={(e) => set("model", e.target.value)} maxLength={80} />
          </Field>
        </Grid>
        <Field label="Tags" optional helperText="Separate tags with commas." error={errors.tags}>
          <Input value={values.tags} onChange={(e) => set("tags", e.target.value)} placeholder="soldering, electronics" />
        </Field>
      </div>
    </Card>
  );
}

export function StockSection({ values, set, errors, currency }: SectionProps & { currency: string }) {
  return (
    <Card padding="lg">
      <CardHeader title="Stock and cost" description="Low-stock alerts fire when free stock across the space falls to the reorder point." />
      <div className="flex flex-col gap-4">
        <Grid>
          <Field label="Unit cost" optional helperText="Last purchase price for one unit." error={errors.unitCost}>
            <PrefixInput prefix={currency} inputMode="decimal" value={values.unitCost} onChange={(e) => set("unitCost", e.target.value)} />
          </Field>
          <Field label="Replacement cost" optional helperText="Charged for loss or damage. Empty uses the unit cost." error={errors.replacement}>
            <PrefixInput prefix={currency} inputMode="decimal" value={values.replacement} onChange={(e) => set("replacement", e.target.value)} />
          </Field>
          <Field label="Reorder point" optional error={errors.reorderPoint}>
            <Input inputMode="numeric" value={values.reorderPoint} onChange={(e) => set("reorderPoint", e.target.value)} />
          </Field>
          <Field label="Reorder quantity" optional error={errors.reorderQuantity}>
            <Input inputMode="numeric" value={values.reorderQuantity} onChange={(e) => set("reorderQuantity", e.target.value)} />
          </Field>
        </Grid>
        {values.tracking === "QUANTITY" ? (
          <CheckboxField checked={values.consumable} onCheckedChange={(v) => set("consumable", v === true)} label="Consumable" description="Used up when issued and never returned, like resistors or filament." />
        ) : null}
        <Field label="Notes" optional error={errors.notes}>
          <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} maxLength={2000} rows={3} />
        </Field>
      </div>
    </Card>
  );
}

export function LendingSection({ values, set, errors, currency }: SectionProps & { currency: string }) {
  return (
    <Card padding="lg">
      <CardHeader title="Lending" description="Empty fields use the category, then the space's lending settings." />
      <div className="flex flex-col gap-4">
        <SwitchRow checked={values.lendable} onCheckedChange={(v) => set("lendable", v)} label="Members can borrow this" description="Shows the item in the borrowing catalogue." />
        {values.lendable ? (
          <>
            <SwitchRow checked={values.requiresApproval} onCheckedChange={(v) => set("requiresApproval", v)} label="Requests need approval" description="Staff approve each request before it is issued." />
            <SwitchRow checked={values.selfCheckout} onCheckedChange={(v) => set("selfCheckout", v)} label="Self-checkout" description="Members may scan it out themselves when the space allows self-checkout." />
            <Grid>
              <Field label="Loan length in days" optional error={errors.loanDays}>
                <Input inputMode="numeric" value={values.loanDays} onChange={(e) => set("loanDays", e.target.value)} />
              </Field>
              <Field label="Deposit" optional error={errors.deposit}>
                <PrefixInput prefix={currency} inputMode="decimal" value={values.deposit} onChange={(e) => set("deposit", e.target.value)} />
              </Field>
              <Field label="Rental" optional error={errors.rentalMode}>
                <Dropdown value={values.rentalMode} onChange={(e) => set("rentalMode", e.target.value as ItemFormValues["rentalMode"])}>
                  <option value="">Use the default</option>
                  {Object.entries(RENTAL_MODE_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Dropdown>
              </Field>
              {values.rentalMode && values.rentalMode !== "FREE" ? (
                <Field label="Rental amount" error={errors.rental}>
                  <PrefixInput prefix={currency} inputMode="decimal" value={values.rental} onChange={(e) => set("rental", e.target.value)} />
                </Field>
              ) : null}
              <Field label="Late fee per day" optional error={errors.lateFee}>
                <PrefixInput prefix={currency} inputMode="decimal" value={values.lateFee} onChange={(e) => set("lateFee", e.target.value)} />
              </Field>
            </Grid>
          </>
        ) : null}
      </div>
    </Card>
  );
}
