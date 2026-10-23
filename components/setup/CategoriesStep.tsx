"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addCategoriesAction, addUnitAction } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip } from "@/components/ui/display";
import { FilterChip } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";

type Props = { slug: string; suggestions: string[]; categories: string[]; units: { name: string; symbol: string }[] };

/** Suggested category chips plus custom ones; then the units items are counted in. */
export function CategoriesStep({ slug, suggestions, categories, units }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const have = new Set(categories.map((name) => name.toLowerCase()));
  const [picked, setPicked] = useState<string[]>(() => suggestions.filter((name) => !have.has(name.toLowerCase())).slice(0, 4));
  const [custom, setCustom] = useState("");
  const [unit, setUnit] = useState({ name: "", symbol: "" });
  const [unitError, setUnitError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const choices = [...new Set([...suggestions, ...picked])].filter((name) => !have.has(name.toLowerCase()));
  const toggle = (name: string) => setPicked((list) => (list.includes(name) ? list.filter((n) => n !== name) : [...list, name]));

  const addCustom = () => {
    const name = custom.trim();
    if (!name) return;
    if (!picked.includes(name)) setPicked((list) => [...list, name]);
    setCustom("");
  };

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-5">
        <CardHeader title="Categories" description="Group the catalogue so members can filter it. Each category can later set its own loan length and fees." />
        {categories.length > 0 ? (
          <div className="flex flex-wrap gap-2" aria-label="Categories you already have">
            {categories.map((name) => <Chip key={name} tone="success">{name}</Chip>)}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {choices.map((name) => <FilterChip key={name} selected={picked.includes(name)} onClick={() => toggle(name)}>{name}</FilterChip>)}
        </div>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
          <Field label="Your own category" className="min-w-0 flex-1">
            <Input value={custom} maxLength={60} onChange={(e) => setCustom(e.target.value)} placeholder="Laser cutting" />
          </Field>
          <Button type="submit" variant="secondary" startIcon={<Plus />}>Add</Button>
        </form>
        <Button
          variant="primary"
          loading={pending}
          disabled={picked.length === 0}
          onClick={() => startTransition(async () => {
            const result = await addCategoriesAction(slug, { names: picked });
            if (!result.ok) return showToast(result.error, "error");
            showToast(result.data?.created ? `${result.data.created} categories added.` : "Those categories already exist.", "success");
            setPicked([]);
            router.refresh();
          })}
        >
          {picked.length > 0 ? `Add ${picked.length} ${picked.length === 1 ? "category" : "categories"}` : "Pick categories to add"}
        </Button>
      </Card>

      <Card padding="lg" className="space-y-5">
        <CardHeader title="Units" description="How quantities are counted. Pieces, packs, metres and grams are ready to use." />
        <div className="flex flex-wrap gap-2">
          {units.map((u) => <Chip key={u.name} tone="neutral">{`${u.name} (${u.symbol})`}</Chip>)}
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await addUnitAction(slug, unit);
              if (!result.ok) return setUnitError(result.error);
              setUnitError(undefined);
              setUnit({ name: "", symbol: "" });
              showToast("Unit added.", "success");
              router.refresh();
            });
          }}
        >
          <Field label="Unit name" error={unitError}>
            <Input value={unit.name} maxLength={30} onChange={(e) => setUnit((u) => ({ ...u, name: e.target.value }))} placeholder="Roll" />
          </Field>
          <Field label="Symbol">
            <Input value={unit.symbol} maxLength={10} onChange={(e) => setUnit((u) => ({ ...u, symbol: e.target.value }))} placeholder="roll" />
          </Field>
          <Button type="submit" variant="secondary" disabled={pending}>Add unit</Button>
        </form>
      </Card>
    </div>
  );
}
