"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startCountAction } from "@/app/actions/counts";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";

/** Start a count: a name, a scope (location subtree and/or category) and blind or not. */
export function NewCountForm({ slug, locations, categories }: { slug: string; locations: LocationOption[]; categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const { run, pending, error } = useActionRunner();
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [blind, setBlind] = useState(true);

  return (
    <Card padding="lg">
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void run(
            () => startCountAction(slug, { name, locationId: locationId || null, categoryId: categoryId || null, blind }),
            "Count started. Counters can begin.",
            (data) => router.push(data ? `/s/${slug}/counts/${data.id}` : `/s/${slug}/counts`),
          );
        }}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Name" helperText="Counters see this name, e.g. “Electronics lab, October”." required>
          <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
        </Field>
        <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label="Where" optionalLabel="The whole space" helper="Counts this location and everything below it." />
        <Field label="Category" optional helperText="Only items in this category.">
          <Dropdown value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Every category</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </Dropdown>
        </Field>
        <SwitchRow label="Blind count" description="Counters don't see the expected quantities until the count is submitted." checked={blind} onCheckedChange={setBlind} />
        <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => router.push(`/s/${slug}/counts`)} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>Start count</Button>
        </div>
      </form>
    </Card>
  );
}
