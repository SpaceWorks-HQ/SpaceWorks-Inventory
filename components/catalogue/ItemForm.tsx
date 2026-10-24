"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createItemAction, updateItemAction } from "@/app/actions/catalogue";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { itemPayload, type ItemFormValues } from "./itemFormModel";
import { BasicsSection, LendingSection, StockSection, type Option } from "./ItemFormSections";

/** Server field names → form field names (money is typed in major units). */
const FIELD_ALIASES: Record<string, string> = { unitCostMinor: "unitCost", replacementMinor: "replacement", depositMinor: "deposit", rentalMinor: "rental", lateFeePerDayMinor: "lateFee" };

function formErrors(fieldErrors: Record<string, string[]> | undefined) {
  const errors: Record<string, string> = {};
  for (const [path, messages] of Object.entries(fieldErrors ?? {})) {
    const key = path.replace(/^item\./, "").split(".")[0]!;
    errors[FIELD_ALIASES[key] ?? key] = messages[0] ?? "Check this field.";
  }
  return errors;
}

export function ItemForm({ slug, itemId, initial, currency, minorDigits, categories: initialCategories, units: initialUnits, suppliers, trackingLocked }: {
  slug: string; itemId: string | null; initial: ItemFormValues; currency: string; minorDigits: number;
  categories: Option[]; units: Option[]; suppliers: Option[]; trackingLocked: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [values, setValues] = useState(initial);
  const [categories, setCategories] = useState(initialCategories);
  const [units, setUnits] = useState(initialUnits);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelHref = itemId ? `/s/${slug}/items/${itemId}` : `/s/${slug}/items`;

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current[key] ? { ...current, [key]: "" } : current));
  };

  const onOptionAdded = (kind: "category" | "unit", option: Option) => {
    if (kind === "category") {
      setCategories((current) => [...current, option].sort((a, b) => a.label.localeCompare(b.label)));
      set("categoryId", option.id);
    } else {
      setUnits((current) => [...current, option].sort((a, b) => a.label.localeCompare(b.label)));
      set("unitId", option.id);
    }
  };

  const submit = () => {
    const converted = itemPayload(values, minorDigits);
    if (!converted.ok) {
      setErrors(converted.errors);
      setFormError("Check the highlighted fields.");
      return;
    }
    startTransition(async () => {
      const result = itemId ? await updateItemAction(slug, itemId, converted.payload) : await createItemAction(slug, converted.payload);
      if (!result.ok) {
        setErrors(formErrors(result.fieldErrors));
        setFormError(result.error);
        return;
      }
      showToast(itemId ? "Saved the item." : "Added the item.", "success");
      router.push(`/s/${slug}/items/${result.data!.id}`);
      router.refresh();
    });
  };

  const sectionProps = { values, set, errors };
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {formError ? <Callout tone="danger" role="alert" title={formError} /> : null}
      <BasicsSection {...sectionProps} slug={slug} categories={categories} units={units} suppliers={suppliers} trackingLocked={trackingLocked} onOptionAdded={onOptionAdded} />
      <StockSection {...sectionProps} currency={currency} />
      <LendingSection {...sectionProps} currency={currency} />
      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Button asChild variant="secondary"><Link href={cancelHref}>Cancel</Link></Button>
        <Button type="submit" variant="primary" loading={pending}>{itemId ? "Save changes" : "Add item"}</Button>
      </div>
    </form>
  );
}
