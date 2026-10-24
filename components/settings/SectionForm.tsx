"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsSection } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, SettingsRow } from "@/components/ui/display";
import { Radio, RadioGroup, Switch } from "@/components/ui/choice";
import { Field, Input, PrefixInput, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";
import type { SettingsSection } from "@/lib/settings/sections";
import { SETTINGS_FIELDS, type FieldSpec, type FormState } from "./settingsFields";
import { fromFormState, toFormState, type StoredValue } from "./settingsForm";

type Props = { slug: string; section: SettingsSection; values: Record<string, StoredValue>; currency: string; minorDigits: number };

/** One settings section as rows of label + help on the left and the control on the right. */
export function SectionForm({ slug, section, values, currency, minorDigits }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const fields = SETTINGS_FIELDS[section];
  const [form, setForm] = useState<FormState>(() => toFormState(fields, values, minorDigits));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const converted = fromFormState(fields, form, minorDigits);
        setErrors(converted.errors);
        if (Object.keys(converted.errors).length > 0) {
          showToast("Check the highlighted fields.", "error");
          return;
        }
        startTransition(async () => {
          const result = await updateSettingsSection(slug, section, converted.values);
          if (!result.ok) {
            setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, list]) => [key, list[0] ?? ""])));
            showToast(result.error, "error");
            return;
          }
          showToast("Settings saved.", "success");
          router.refresh();
        });
      }}
    >
      <Card padding="lg">
        {fields.filter((field) => !field.showIf || field.showIf(form)).map((field) => (
          <SettingsRow key={field.key} title={field.label} description={field.help}>
            <FieldControl field={field} value={form[field.key] ?? ""} error={errors[field.key]} currency={currency} onChange={(value) => set(field.key, value)} />
          </SettingsRow>
        ))}
        <div className="flex justify-end pt-6">
          <Button type="submit" variant="primary" loading={pending}>Save changes</Button>
        </div>
      </Card>
    </form>
  );
}

function FieldControl({ field, value, error, currency, onChange }: { field: FieldSpec; value: string | boolean; error?: string; currency: string; onChange: (value: string | boolean) => void }) {
  if (field.kind === "switch") {
    return (
      <div className="flex items-center gap-3">
        <Switch aria-label={field.label} checked={value === true} onCheckedChange={(checked) => onChange(checked)} />
        <span className="text-body-ui text-ink-secondary">{value === true ? "On" : "Off"}</span>
      </div>
    );
  }
  if (field.kind === "choice") {
    return (
      <RadioGroup aria-label={field.label} value={String(value)} onValueChange={(next) => onChange(next)}>
        {(field.options ?? []).map((option) => <Radio key={option.value} value={option.value} label={option.label} description={option.description} />)}
      </RadioGroup>
    );
  }
  const text = typeof value === "string" ? value : "";
  const input = (() => {
    switch (field.kind) {
      case "textarea":
        return <Textarea rows={3} value={text} onChange={(e) => onChange(e.target.value)} />;
      case "money":
        return <PrefixInput prefix={currency} inputMode="decimal" value={text} onChange={(e) => onChange(e.target.value)} />;
      case "number":
      case "optionalNumber":
        return <Input inputMode="numeric" value={text} onChange={(e) => onChange(e.target.value)} className="max-w-40" />;
      default:
        return <Input type={field.kind === "email" ? "email" : "text"} value={text} onChange={(e) => onChange(e.target.value)} />;
    }
  })();
  return (
    <div className="flex items-end gap-3">
      <Field label={field.label} hideLabel error={error} className="min-w-0 flex-1">{input}</Field>
      {field.unit && (field.kind === "number" || field.kind === "optionalNumber") ? <span className="pb-3 text-body-ui text-ink-muted">{field.unit}</span> : null}
    </div>
  );
}
