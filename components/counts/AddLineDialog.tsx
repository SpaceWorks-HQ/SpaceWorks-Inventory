"use client";

import { useMemo, useState } from "react";
import { addCountLineAction } from "@/app/actions/counts";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, SearchInput } from "@/components/ui/field";

type ItemOption = { id: string; name: string; sku: string; serialized: boolean };

/** Add an item found at a location the snapshot didn't include. */
export function AddLineDialog({ slug, countId, items, locations }: { slug: string; countId: string; items: ItemOption[]; locations: LocationOption[] }) {
  const { run, pending, error, setError } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [counted, setCounted] = useState(1);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    const found = term ? items.filter((item) => item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term)) : items;
    return found.slice(0, 50);
  }, [items, search]);
  const chosen = items.find((item) => item.id === itemId);

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setSearch(""); setItemId(""); setCounted(1); setError(null); } }}>
      <DialogTrigger asChild>
        <Button variant="secondary">Add an item found here</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            const saved = await run(() => addCountLineAction(slug, { countId, itemId, locationId, counted: chosen?.serialized ? 0 : counted }), "Line added to the count.");
            if (saved) setOpen(false);
          }}
        >
          <DialogHeader title="Add an item found here" description="For stock sitting somewhere the count didn't expect it." />
          <DialogBody className="flex flex-col gap-4">
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            <Field label="Find the item">
              <SearchInput value={search} onChange={(event) => setSearch(event.target.value)} onClear={() => setSearch("")} placeholder="Name or SKU" />
            </Field>
            <Field label="Item" helperText={matches.length === 50 ? "Showing the first 50 matches; type more to narrow it down." : undefined}>
              <Dropdown value={itemId} onChange={(event) => setItemId(event.target.value)}>
                <option value="" disabled>{matches.length ? "Choose an item" : "No items match"}</option>
                {matches.map((item) => <option key={item.id} value={item.id}>{`${item.name} (${item.sku})`}</option>)}
              </Dropdown>
            </Field>
            <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label="Where you found it" />
            {chosen?.serialized ? (
              <Callout tone="info">Tagged tools are counted by scanning: add the line, then scan each tag at this shelf.</Callout>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-label text-ink">Counted</span>
                <QuantityInput label="Counted quantity" value={counted} onChange={setCounted} />
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={!itemId || !locationId}>Add line</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
