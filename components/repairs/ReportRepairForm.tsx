"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssetStatus, RepairSeverity, TrackingMode } from "@prisma/client";
import { reportRepairAction } from "@/app/actions/repairs";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { SEVERITIES, SEVERITY_LABEL } from "@/lib/repairs/labels";

type Item = { id: string; name: string; sku: string; tracking: TrackingMode };
type Asset = { id: string; itemId: string; assetTag: string; status: AssetStatus };

/** Report a damaged or broken item: what, how bad, photos; staff may take it out of use. */
export function ReportRepairForm({ slug, staff, items, assets, locations, presetItemId, presetAssetId }: { slug: string; staff: boolean; items: Item[]; assets: Asset[]; locations: { id: string; label: string }[]; presetItemId: string | null; presetAssetId: string | null }) {
  const router = useRouter();
  const presetAsset = assets.find((asset) => asset.id === presetAssetId) ?? null;
  const [itemId, setItemId] = useState(presetAsset?.itemId ?? (items.some((item) => item.id === presetItemId) ? presetItemId! : ""));
  const [assetId, setAssetId] = useState(presetAsset?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<RepairSeverity>("MEDIUM");
  const [takeOutOfUse, setTakeOutOfUse] = useState(true);
  const [quantity, setQuantity] = useState("1");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const { run, pending, error } = useActionRunner();
  const item = items.find((entry) => entry.id === itemId) ?? null;
  const itemAssets = useMemo(() => assets.filter((asset) => asset.itemId === itemId), [assets, itemId]);
  const serialized = item?.tracking === "SERIALIZED";

  const submit = () =>
    run(
      () => reportRepairAction(slug, handoverFormData({ itemId, assetId: serialized ? assetId || null : null, title, description, severity, takeOutOfUse: staff && takeOutOfUse, quantity: Number(quantity) || 0, locationId: serialized ? null : locationId || null }, photos)),
      "Problem reported. The inventory managers have been told.",
      (data) => router.push(data && typeof data === "object" && "id" in data ? `/s/${slug}/repairs/${(data as { id: string }).id}` : `/s/${slug}/repairs`),
    );

  return (
    <Card padding="lg">
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field label="Item" required>
          <Dropdown value={itemId} onChange={(event) => { setItemId(event.target.value); setAssetId(""); }} required>
            <option value="">Choose the item</option>
            {items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} ({entry.sku})</option>)}
          </Dropdown>
        </Field>
        {staff && serialized ? (
          <Field label="Which one" optional helperText="The asset tag on its label.">
            <Dropdown value={assetId} onChange={(event) => setAssetId(event.target.value)}>
              <option value="">Not sure</option>
              {itemAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetTag}</option>)}
            </Dropdown>
          </Field>
        ) : null}
        <Field label="What is wrong" required helperText="A few words, for example “Chuck slips under load”.">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </Field>
        <Field label="Details" required helperText="What happened, what you tried, anything a technician should bring.">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} required />
        </Field>
        <Field label="How urgent">
          <Dropdown value={severity} onChange={(event) => setSeverity(event.target.value as RepairSeverity)}>
            {SEVERITIES.map((value) => <option key={value} value={value}>{SEVERITY_LABEL[value]}</option>)}
          </Dropdown>
        </Field>
        <PhotoCapture files={photos} onChange={setPhotos} min={0} max={6} label="Photos (optional)" disabled={pending} />
        {staff ? (
          <div className="grid gap-4 rounded-lg border border-line p-4">
            <SwitchRow label="Take it out of use" description={serialized ? "The asset can't be lent or moved out until the repair is closed." : "These units can't be lent until the repair is closed."} checked={takeOutOfUse} onCheckedChange={setTakeOutOfUse} />
            {takeOutOfUse && !serialized ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="How many">
                  <Input type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} />
                </Field>
                <Field label="Where they are">
                  <Dropdown value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.label}</option>)}
                  </Dropdown>
                </Field>
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pending} disabled={!itemId}>Report the problem</Button>
        </div>
      </form>
    </Card>
  );
}
