"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCategoryAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";
import { moneyInputValue } from "@/lib/format/quantity";
import { optionalMoney, optionalWhole } from "./settingsForm";

export type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  loanDays: number | null;
  depositMinor: number | null;
  rentalMode: "FREE" | "PER_DAY" | "PER_WEEK" | "FLAT" | null;
  rentalMinor: number | null;
  lateFeePerDayMinor: number | null;
  items: number;
};

const RENTAL: Record<string, string> = { "": "Use the space setting", FREE: "Free", PER_DAY: "Per day", PER_WEEK: "Per week", FLAT: "Flat fee" };

type Draft = { name: string; parentId: string; description: string; loanDays: string; deposit: string; rentalMode: string; rental: string; lateFee: string };

function draftOf(category: CategoryRow | null, digits: number): Draft {
  return {
    name: category?.name ?? "",
    parentId: category?.parentId ?? "",
    description: category?.description ?? "",
    loanDays: category?.loanDays?.toString() ?? "",
    deposit: moneyInputValue(category?.depositMinor, digits),
    rentalMode: category?.rentalMode ?? "",
    rental: moneyInputValue(category?.rentalMinor, digits),
    lateFee: moneyInputValue(category?.lateFeePerDayMinor, digits),
  };
}

/** Create or edit a category with its optional lending overrides (blank = the space setting). */
export function CategoryDialog({ slug, category, parents, currency, minorDigits, open, onClose }: { slug: string; category: CategoryRow | null; parents: { id: string; label: string }[]; currency: string; minorDigits: number; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft>(() => draftOf(category, minorDigits));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const values = {
      name: draft.name,
      parentId: draft.parentId,
      description: draft.description,
      loanDays: optionalWhole(draft.loanDays),
      depositMinor: optionalMoney(draft.deposit, minorDigits),
      rentalMode: draft.rentalMode || null,
      rentalMinor: optionalMoney(draft.rental, minorDigits),
      lateFeePerDayMinor: optionalMoney(draft.lateFee, minorDigits),
    };
    const local: Record<string, string> = {};
    if (Number.isNaN(values.loanDays)) local.loanDays = "Enter a whole number of days.";
    for (const key of ["depositMinor", "rentalMinor", "lateFeePerDayMinor"] as const) if (Number.isNaN(values[key])) local[key] = "Enter an amount, or leave it blank.";
    setErrors(local);
    if (Object.keys(local).length > 0) return;
    startTransition(async () => {
      const result = await saveCategoryAction(slug, { id: category?.id ?? null, values });
      if (!result.ok) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, list]) => [key, list[0] ?? ""])));
        showToast(result.error, "error");
        return;
      }
      showToast(category ? "Category saved." : "Category added.", "success");
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent size="md">
        <DialogHeader title={category ? `Edit ${category.name}` : "Add a category"} description="Lending overrides apply to every item in the category unless the item sets its own. Leave them blank to use the space settings." />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} className="sm:col-span-2">
            <Input value={draft.name} maxLength={60} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <Field label="Inside" optional error={errors.parentId}>
            <Dropdown value={draft.parentId} onChange={(e) => set("parentId", e.target.value)}>
              <option value="">Top level</option>
              {parents.filter((p) => p.id !== category?.id).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Dropdown>
          </Field>
          <Field label="Loan length" optional helperText="Days" error={errors.loanDays}>
            <Input inputMode="numeric" value={draft.loanDays} onChange={(e) => set("loanDays", e.target.value)} />
          </Field>
          <Field label="Description" optional error={errors.description} className="sm:col-span-2">
            <Textarea rows={2} value={draft.description} maxLength={300} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <Field label="Deposit per item" optional error={errors.depositMinor}>
            <PrefixInput prefix={currency} inputMode="decimal" value={draft.deposit} onChange={(e) => set("deposit", e.target.value)} />
          </Field>
          <Field label="Late fee per day" optional error={errors.lateFeePerDayMinor}>
            <PrefixInput prefix={currency} inputMode="decimal" value={draft.lateFee} onChange={(e) => set("lateFee", e.target.value)} />
          </Field>
          <Field label="Rental" error={errors.rentalMode}>
            <Dropdown value={draft.rentalMode} onChange={(e) => set("rentalMode", e.target.value)}>
              {Object.entries(RENTAL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Dropdown>
          </Field>
          <Field label="Rental amount" optional error={errors.rentalMinor}>
            <PrefixInput prefix={currency} inputMode="decimal" value={draft.rental} onChange={(e) => set("rental", e.target.value)} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending}>{category ? "Save category" : "Add category"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
