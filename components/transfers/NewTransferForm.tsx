"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestTransferAction } from "@/app/actions/transfers";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { TransferLinePicker, type PickedLine } from "./TransferLinePicker";

type Mode = "internal" | "push" | "pull";
export type LocalItem = { id: string; name: string; sku: string; available: Record<string, number> };
export type SpaceOption = { slug: string; name: string };
export type SharedStock = { slug: string; name: string; items: { id: string; name: string; sku: string; available: number }[] } | null;

type Props = {
  slug: string;
  initialMode: Mode;
  locations: LocationOption[];
  localItems: LocalItem[];
  pushTargets: SpaceOption[];
  pullSources: SpaceOption[];
  shared: SharedStock;
};

/** Raise a transfer: between shelves here, to another space, or from a space that shares its stock. */
export function NewTransferForm({ slug, initialMode, locations, localItems, pushTargets, pullSources, shared }: Props) {
  const router = useRouter();
  const { run, pending, error, setError } = useActionRunner();
  const [changingSource, setChangingSource] = useState(false);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [sourceLocationId, setSourceLocationId] = useState("");
  const [destLocationId, setDestLocationId] = useState("");
  const [destSpaceSlug, setDestSpaceSlug] = useState(pushTargets[0]?.slug ?? "");
  const [lines, setLines] = useState<PickedLine[]>([]);
  const [reason, setReason] = useState("");
  const [neededBy, setNeededBy] = useState("");

  const pickable = mode === "pull"
    ? shared?.items ?? []
    : localItems.filter((item) => (item.available[sourceLocationId] ?? 0) > 0).map((item) => ({ id: item.id, name: item.name, sku: item.sku, available: item.available[sourceLocationId] ?? 0 }));
  const switchMode = (next: Mode) => {
    setMode(next);
    setLines([]);
  };
  const ready = !changingSource && lines.length > 0 && lines.every((line) => line.quantity <= (pickable.find((item) => item.id === line.itemId)?.available ?? 0)) && (mode === "internal" ? sourceLocationId && destLocationId : mode === "push" ? sourceLocationId && destSpaceSlug : Boolean(shared));

  const submit = () => {
    if (!ready) return;
    const common = { lines, reason, neededBy };
    const input = mode === "internal" ? { ...common, mode, sourceLocationId, destLocationId }
      : mode === "push" ? { ...common, mode, sourceLocationId, destSpaceSlug }
      : { ...common, mode, sourceSpaceSlug: shared?.slug ?? "", destLocationId: destLocationId || null };
    void run(() => requestTransferAction(slug, input), "Transfer requested.", (data) => router.push(`/s/${slug}/transfers/${data?.transferId ?? ""}`));
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <Card className="flex flex-col gap-4">
        <CardHeader title="Where is it going?" className="mb-0" />
        <SegmentedControl<Mode>
          ariaLabel="Kind of transfer"
          value={mode}
          onValueChange={switchMode}
          options={[{ value: "internal", label: "Between shelves" }, { value: "push", label: "Send to a space" }, { value: "pull", label: "Request from a space" }]}
          className="flex-wrap"
        />
        {mode !== "pull" ? (
          <LocationPicker label="From" locations={locations} value={sourceLocationId} onChange={(id) => { setSourceLocationId(id); setLines([]); }} />
        ) : null}
        {mode === "internal" ? <LocationPicker label="To" locations={locations.filter((l) => l.id !== sourceLocationId)} value={destLocationId} onChange={setDestLocationId} /> : null}
        {mode === "push" ? (
          pushTargets.length ? (
            <Field label="To space" helperText="The receiving space chooses the shelf when it arrives.">
              <Dropdown value={destSpaceSlug} onChange={(event) => setDestSpaceSlug(event.target.value)}>
                {pushTargets.map((space) => <option key={space.slug} value={space.slug}>{space.name}</option>)}
              </Dropdown>
            </Field>
          ) : <Callout tone="info">No other space of this install accepts transfers right now.</Callout>
        ) : null}
        {mode === "pull" ? (
          pullSources.length ? (
            <>
              <Field label="From space" helperText="You see their item names and free counts only. They approve, pick and dispatch.">
                <Dropdown value={shared?.slug ?? ""} disabled={changingSource} onChange={(event) => {
                  setLines([]);
                  setSourceLocationId("");
                  setError(null);
                  setChangingSource(true);
                  router.push(`/s/${slug}/transfers/new?mode=pull&from=${encodeURIComponent(event.target.value)}`);
                }}>
                  {!shared ? <option value="" disabled>Choose a space</option> : null}
                  {pullSources.map((space) => <option key={space.slug} value={space.slug}>{space.name}</option>)}
                </Dropdown>
              </Field>
              <LocationPicker label="Receive into" optionalLabel="Choose when it arrives" locations={locations} value={destLocationId} onChange={setDestLocationId} />
            </>
          ) : <Callout tone="info">No other space of this install shares its stock list.</Callout>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader title="What should move?" description={mode === "pull" ? (shared ? `Free stock at ${shared.name}.` : "Choose a space first.") : sourceLocationId ? "Free stock at the chosen shelf." : "Choose where it comes from first."} className="mb-0" />
        <TransferLinePicker key={`${mode}:${mode === "pull" ? shared?.slug ?? "" : sourceLocationId}`} onOneShelf={mode === "pull"} items={pickable} lines={lines} onChange={setLines} disabled={pending || changingSource || (mode === "pull" ? !shared : !sourceLocationId)} />
      </Card>

      <Card className="flex flex-col gap-4">
        <CardHeader title="Details" className="mb-0" />
        <Field label="Reason" optional>
          <Textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Soldering workshop on Saturday" />
        </Field>
        <Field label="Needed by" optional>
          <Input type="date" value={neededBy} onChange={(event) => setNeededBy(event.target.value)} className="sm:max-w-60" />
        </Field>
      </Card>

      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {!ready ? <p className="text-caption text-ink-muted">{changingSource ? "Wait for the source stock to load." : "Choose the source, destination and at least one available item."}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending} disabled={!ready}>Request transfer</Button>
        <Button variant="quiet" onClick={() => router.push(`/s/${slug}/transfers`)}>Cancel</Button>
      </div>
    </form>
  );
}
