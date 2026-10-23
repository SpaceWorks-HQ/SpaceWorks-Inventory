"use client";

import { useState } from "react";
import { receiveReturnAction } from "@/app/actions/transfers";
import { handoverFormData } from "@/components/desk/handoverForm";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { scanIndex, type TransferLineView } from "./types";

type Props = { slug: string; transferId: string; lines: TransferLineView[]; locations: LocationOption[]; defaultLocationId: string | null; minPhotos: number };

/** The sender takes returned units back onto a shelf: scan, count, photos. */
export function ReceiveReturnFlow({ slug, transferId, lines, locations, defaultLocationId, minPhotos }: Props) {
  const { run, pending, error } = useActionRunner();
  const back = lines.filter((line) => line.comingBack > 0);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(back.map((line) => [line.id, line.tracking === "QUANTITY" ? line.comingBack : 0])));
  const [codes, setCodes] = useState<string[]>([]);
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");

  const { known } = scanIndex([
    ...back.filter((line) => line.tracking === "QUANTITY").map((line) => ({ code: line.itemCode, label: `${line.itemName} (${line.sku})`, lineId: line.id })),
    ...back.flatMap((line) => line.assets.filter((asset) => asset.state === "RETURNING").map((asset) => ({ code: asset.code, label: `${line.itemName} · ${asset.tag}`, lineId: line.id }))),
  ]);
  const assetUnits = back.flatMap((line) => line.assets).filter((asset) => asset.state === "RETURNING" && codes.includes(asset.code)).length;
  const units = assetUnits + back.filter((line) => line.tracking === "QUANTITY").reduce((sum, line) => sum + (quantities[line.id] ?? 0), 0);
  const ready = units > 0 && Boolean(locationId) && photos.length >= Math.max(1, minPhotos);

  return (
    <Card as="section" aria-label="Receive returned units" className="flex flex-col gap-6">
      <CardHeader title="Receive the return" description="Units sent back by the receiving space. Scan their labels as they come off the van." className="mb-0" />
      <Scanner codes={codes} onChange={setCodes} known={known} disabled={pending} />
      <ul className="divide-y divide-line rounded-lg border border-line">
        {back.map((line) => (
          <li key={line.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0 text-body-ui text-ink">{line.itemName} <span className="text-ink-muted">{line.comingBack} coming back</span></span>
            {line.tracking === "QUANTITY" ? (
              <QuantityInput label={`Returned ${line.itemName}`} value={quantities[line.id] ?? 0} max={line.comingBack} onChange={(value) => setQuantities((current) => ({ ...current, [line.id]: value }))} />
            ) : (
              <span className="text-caption text-ink-muted">{line.assets.filter((asset) => asset.state === "RETURNING" && codes.includes(asset.code)).length} tags scanned</span>
            )}
          </li>
        ))}
      </ul>
      <LocationPicker label="Put it on" locations={locations} value={locationId} onChange={setLocationId} />
      <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} disabled={pending} />
      <Field label="Remarks" optional><Textarea rows={3} maxLength={1000} value={remarks} onChange={(event) => setRemarks(event.target.value)} /></Field>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div>
        <Button
          variant="primary"
          loading={pending}
          disabled={!ready}
          onClick={() => {
            const payload = { transferId, locationId: locationId || null, lines: back.filter((line) => line.tracking === "QUANTITY").map((line) => ({ lineId: line.id, quantity: quantities[line.id] ?? 0 })), scannedCodes: codes, remarks };
            void run(() => receiveReturnAction(slug, handoverFormData(payload, photos)), "Return received back into stock.");
          }}
        >
          Receive {units} {units === 1 ? "unit" : "units"}
        </Button>
      </div>
    </Card>
  );
}
