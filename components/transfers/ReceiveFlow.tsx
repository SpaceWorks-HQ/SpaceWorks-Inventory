"use client";

import { useState } from "react";
import { receiveTransferAction } from "@/app/actions/transfers";
import { handoverFormData } from "@/components/desk/handoverForm";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Scanner } from "@/components/desk/Scanner";
import { DeskStepper } from "@/components/desk/DeskStepper";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { useShowDone } from "@/components/desk/useShowDone";
import { evidenceHint } from "@/lib/desk/stepper";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Field, Textarea } from "@/components/ui/field";
import { scanIndex, type TransferLineView } from "./types";
import { receiptLabelsMissing } from "@/lib/desk/transferStock";

type Props = { slug: string; transferId: string; lines: TransferLineView[]; locations: LocationOption[]; defaultLocationId: string | null; minPhotos: number };

/** Unpack: scan labels and tags, count good and damaged units, choose the shelf, photos, remarks. */
export function ReceiveFlow({ slug, transferId, lines, locations, defaultLocationId, minPhotos }: Props) {
  const { run, pending, error } = useActionRunner();
  const showDone = useShowDone();
  const open = lines.filter((line) => line.inTransit > 0);
  const [counts, setCounts] = useState<Record<string, { received: number; damaged: number }>>(() => Object.fromEntries(open.map((line) => [line.id, { received: line.tracking === "QUANTITY" ? line.inTransit : 0, damaged: 0 }])));
  const [codes, setCodes] = useState<string[]>([]);
  const [damagedAssets, setDamagedAssets] = useState<string[]>([]);
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");

  const { known } = scanIndex([
    ...open.filter((line) => line.tracking === "QUANTITY").map((line) => ({ code: line.itemCode, label: `${line.itemName} (${line.sku})`, lineId: line.id })),
    ...open.flatMap((line) => line.assets.filter((asset) => asset.state === "DISPATCHED").map((asset) => ({ code: asset.code, label: `${line.itemName} · ${asset.tag}`, lineId: line.id }))),
  ]);
  const scannedAssets = open.flatMap((line) => line.assets.filter((asset) => asset.state === "DISPATCHED" && codes.includes(asset.code)).map((asset) => ({ ...asset, itemName: line.itemName })));
  const quantityUnits = open.filter((line) => line.tracking === "QUANTITY").reduce((sum, line) => sum + (counts[line.id]?.received ?? 0) + (counts[line.id]?.damaged ?? 0), 0);
  const units = quantityUnits + scannedAssets.length;
  const anyDamaged = damagedAssets.length > 0 || Object.values(counts).some((count) => count.damaged > 0);
  // Same rule as lib/transfers/workflow/receive.ts: a quantity line with units needs its label scanned.
  const labelsMissing = receiptLabelsMissing(open.map((line) => ({ ...line, units: (counts[line.id]?.received ?? 0) + (counts[line.id]?.damaged ?? 0) })), codes);
  const completed = [units > 0 && !labelsMissing, units > 0, Boolean(locationId) && photos.length >= Math.max(1, minPhotos) && (!anyDamaged || remarks.trim().length > 0)];
  const ready = completed.every(Boolean);
  const setCount = (lineId: string, key: "received" | "damaged", value: number) => setCounts((current) => ({ ...current, [lineId]: { ...(current[lineId] ?? { received: 0, damaged: 0 }), [key]: value } }));

  const submit = () => {
    const payload = {
      transferId,
      destLocationId: locationId || null,
      lines: open.filter((line) => line.tracking === "QUANTITY").map((line) => ({ lineId: line.id, received: counts[line.id]?.received ?? 0, damaged: counts[line.id]?.damaged ?? 0 })),
      damagedAssetIds: damagedAssets.filter((id) => scannedAssets.some((asset) => asset.id === id)),
      scannedCodes: codes,
      remarks,
    };
    void run(() => receiveTransferAction(slug, handoverFormData(payload, photos)), "Received into stock.", () => showDone("receive"));
  };

  const shelfReady = completed[2]!;
  return (
    <DeskStepper
      label="Receive"
      title="Receive"
      description="Scan each item label and every asset tag as you unpack. Receive in parts if not everything arrived; the rest stays in transit."
      error={error}
      steps={[
        { title: "Scan what arrived", ready: codes.length > 0, hint: "Scan the labels of what arrived.", content: <Scanner codes={codes} onChange={setCodes} known={known} disabled={pending} /> },
        {
          title: "Check the quantities",
          ready: completed[0]! && completed[1]!,
          hint: labelsMissing ? "Scan the label of each item you're receiving." : "Receive at least one unit.",
          content: (
            <>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {open.map((line) => (
                  <li key={line.id} className="flex flex-col gap-2 px-4 py-3">
                    <span className="text-body-ui text-ink">{line.itemName} <span className="text-ink-muted">{line.inTransit} in transit</span></span>
                    {line.tracking === "QUANTITY" ? (
                      <span className="flex flex-wrap items-center gap-4 text-body-ui text-ink-secondary">
                        <span className="flex items-center gap-2">Good <QuantityInput label={`Good ${line.itemName} received`} value={counts[line.id]?.received ?? 0} max={line.inTransit - (counts[line.id]?.damaged ?? 0)} onChange={(value) => setCount(line.id, "received", value)} /></span>
                        <span className="flex items-center gap-2">Damaged <QuantityInput label={`Damaged ${line.itemName} received`} value={counts[line.id]?.damaged ?? 0} max={line.inTransit - (counts[line.id]?.received ?? 0)} onChange={(value) => setCount(line.id, "damaged", value)} /></span>
                        {codes.includes(line.itemCode) ? null : <span className="text-caption text-danger-fg">Scan the label</span>}
                      </span>
                    ) : (
                      <span className="text-caption text-ink-muted">{scannedAssets.filter((asset) => line.assets.some((a) => a.id === asset.id)).length} of {line.inTransit} tags scanned</span>
                    )}
                  </li>
                ))}
              </ul>
              {scannedAssets.length ? (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-label text-ink">Tick any tool that arrived damaged</legend>
                  {scannedAssets.map((asset) => (
                    <CheckboxField key={asset.id} label={`${asset.itemName} · ${asset.tag}`} checked={damagedAssets.includes(asset.id)} onCheckedChange={(on) => setDamagedAssets((current) => (on === true ? [...current, asset.id] : current.filter((id) => id !== asset.id)))} />
                  ))}
                </fieldset>
              ) : null}
            </>
          ),
        },
        {
          title: "Shelf, photos and remarks",
          ready: shelfReady,
          hint: !locationId ? "Choose the shelf to put it on." : anyDamaged && photos.length >= Math.max(1, minPhotos) ? "Describe the damage in the remarks." : evidenceHint(minPhotos, anyDamaged),
          content: (
            <>
              <LocationPicker label="Put it on" locations={locations} value={locationId} onChange={setLocationId} helper="Damaged units go to this shelf's repair hold." />
              <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} disabled={pending} />
              <Field label="Remarks" optional={!anyDamaged} helperText={anyDamaged ? "Describe the damage." : undefined}>
                <Textarea rows={3} maxLength={1000} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
              </Field>
            </>
          ),
        },
      ]}
      finishHint={ready ? null : "Go back and finish the scans and quantities."}
      finish={<Button variant="primary" loading={pending} disabled={!ready} onClick={submit}>Receive {units} {units === 1 ? "unit" : "units"}</Button>}
    />
  );
}
