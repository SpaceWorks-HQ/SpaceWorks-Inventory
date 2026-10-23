"use client";

import { useMemo, useState } from "react";
import { dispatchTransferAction } from "@/app/actions/transfers";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Scanner } from "@/components/desk/Scanner";
import { StepHeading } from "@/components/desk/StepHeading";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { scanIndex, type PickableAsset, type TransferLineView } from "./types";

/** Pick list → scan every label → photos → carrier details → dispatch. */
export function DispatchFlow({ slug, transferId, lines, assets, minPhotos }: { slug: string; transferId: string; lines: TransferLineView[]; assets: PickableAsset[]; minPhotos: number }) {
  const { run, pending, error } = useActionRunner();
  const approved = lines.filter((line) => line.approved > 0);
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(approved.map((line) => [line.id, line.approved])));
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [carrier, setCarrier] = useState("");
  const [trackingRef, setTrackingRef] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [remarks, setRemarks] = useState("");

  const { known, lineOf } = useMemo(() => {
    return scanIndex([
      ...approved.filter((line) => line.tracking === "QUANTITY").map((line) => ({ code: line.itemCode, label: `${line.itemName} (${line.sku})`, lineId: line.id })),
      ...assets.map((asset) => ({ code: asset.code, label: `${asset.itemName} · ${asset.tag}`, lineId: approved.find((line) => line.itemId === asset.itemId)?.id ?? "" })),
    ]);
  }, [approved, assets]);

  const progress = approved.map((line) => {
    const scanned = codes.filter((code) => lineOf[code] === line.id).length;
    const serialized = line.tracking === "SERIALIZED";
    const sending = serialized ? Math.min(scanned, line.approved) : quantities[line.id] ?? 0;
    const ready = serialized ? scanned > 0 && scanned <= line.approved : sending === 0 || scanned > 0;
    return { line, scanned, sending, ready };
  });
  const units = progress.reduce((sum, entry) => sum + entry.sending, 0);
  const completed = [units > 0, units > 0 && progress.every((entry) => entry.ready || entry.sending === 0), photos.length >= Math.max(1, minPhotos)];
  const canSend = completed.every(Boolean);

  return (
    <Card as="section" aria-label="Dispatch" className="flex flex-col gap-6">
      <CardHeader title="Pick and dispatch" description="Scan each item label as you pick it, and the asset tag of every tool. Units you don't send are released." className="mb-0" />
      <section className="flex flex-col gap-3">
        <StepHeading step={1} completed={completed}>Pick list</StepHeading>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {progress.map(({ line, scanned, ready }) => (
            <li key={line.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0">
                <span className="block text-body-ui text-ink">{line.itemName}</span>
                <span className="block text-caption text-ink-muted">
                  {line.tracking === "SERIALIZED" ? `${scanned} of ${line.approved} tags scanned` : `${line.approved} approved · ${scanned ? "label scanned" : "scan the label"}`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {line.tracking === "QUANTITY" ? (
                  <QuantityInput label={`Send how many ${line.itemName}`} value={quantities[line.id] ?? 0} max={line.approved} onChange={(value) => setQuantities((current) => ({ ...current, [line.id]: value }))} />
                ) : null}
                <Chip tone={ready ? "success" : "warning"} size="sm">{ready ? "Ready" : "To scan"}</Chip>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <StepHeading step={2} completed={completed}>Scan labels</StepHeading>
        <Scanner codes={codes} onChange={setCodes} known={known} disabled={pending} />
      </section>
      <section className="flex flex-col gap-4">
        <StepHeading step={3} completed={completed}>Photos and shipping</StepHeading>
        <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} disabled={pending} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Carrier" optional><Input value={carrier} maxLength={80} onChange={(event) => setCarrier(event.target.value)} placeholder="e.g. Hand carry, Blue Dart" /></Field>
          <Field label="Tracking reference" optional><Input value={trackingRef} maxLength={80} onChange={(event) => setTrackingRef(event.target.value)} /></Field>
          <Field label="Expected arrival" optional><Input type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} /></Field>
        </div>
        <Field label="Remarks" optional><Textarea rows={3} maxLength={1000} value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Packing, condition, anything the receiver should know" /></Field>
      </section>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div>
        <Button
          variant="primary"
          loading={pending}
          disabled={!canSend}
          onClick={() => void run(() => dispatchTransferAction(slug, handoverFormData({ transferId, quantities, scannedCodes: codes, carrier, trackingRef, expectedAt, remarks }, photos)), "Dispatched. The receiving side has been told.")}
        >
          Dispatch {units} {units === 1 ? "unit" : "units"}
        </Button>
      </div>
    </Card>
  );
}
