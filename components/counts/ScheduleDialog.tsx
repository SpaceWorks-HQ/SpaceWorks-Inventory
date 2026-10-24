"use client";

import { useState } from "react";
import { saveCountScheduleAction } from "@/app/actions/counts";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";

/** Create a count schedule: name, scope, how often, blind, first run. */
export function ScheduleDialog({ slug, locations, categories }: { slug: string; locations: LocationOption[]; categories: Array<{ id: string; name: string }> }) {
  const { run, pending, error, setError } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [everyDays, setEveryDays] = useState(30);
  const [blind, setBlind] = useState(true);
  const [firstRunDate, setFirstRunDate] = useState("");

  const reset = () => {
    setName("");
    setLocationId("");
    setCategoryId("");
    setEveryDays(30);
    setBlind(true);
    setFirstRunDate("");
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="secondary">Add schedule</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await run(
              () => saveCountScheduleAction(slug, { name, locationId: locationId || null, categoryId: categoryId || null, everyDays, blind, firstRunDate }),
              "Schedule added.",
            );
            if (saved) setOpen(false);
          }}
        >
          <DialogHeader title="Add a count schedule" description="A count of this scope opens on the first run date and then repeats." />
          <DialogBody className="flex flex-col gap-4">
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            <Field label="Name" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="e.g. Electronics shelves" />
            </Field>
            <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label="Where" optionalLabel="The whole space" />
            <Field label="Category" optional>
              <Dropdown value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Every category</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Dropdown>
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-label text-ink">Repeat every</span>
              <span className="flex items-center gap-2 text-body-ui text-ink">
                <QuantityInput label="Days between counts" value={everyDays} onChange={setEveryDays} min={1} max={365} /> days
              </span>
            </div>
            <Field label="First run" optional helperText="Leave blank to open the first count today.">
              <Input type="date" value={firstRunDate} onChange={(event) => setFirstRunDate(event.target.value)} />
            </Field>
            <SwitchRow label="Blind counts" description="Hide expected quantities from counters." checked={blind} onCheckedChange={setBlind} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!name.trim()}>Add schedule</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
