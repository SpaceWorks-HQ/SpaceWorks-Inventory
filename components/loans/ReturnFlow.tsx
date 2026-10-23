"use client";

import { useMemo, useState } from "react";
import { returnLoanAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import type { LocationOption } from "@/components/desk/LocationPicker";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { returnProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { ReturnLineRow, type ReturnLineState, type ReturnLineView } from "./ReturnLineRow";
import { ScanChecklist } from "./ScanChecklist";

type Props = {
  slug: string;
  loanId: string;
  lines: Array<ReturnLineView & HandoverLine>;
  container: { code: string; label: string } | null;
  locations: LocationOption[];
  minPhotos: number;
};

/** Take items back: per line good, damaged or lost, where it goes, scans, photos and remarks. */
export function ReturnFlow({ slug, loanId, lines, container, locations, minPhotos }: Props) {
  const [states, setStates] = useState<Record<string, ReturnLineState>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, { returned: line.outstanding, damaged: 0, lost: 0, locationId: line.locationId ?? "" }])));
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of lines) {
      if (line.assetCode) map[line.assetCode] = line.label;
      else map[line.itemCode] = `${line.name} (item label)`;
    }
    if (container) map[container.code] = container.label;
    return map;
  }, [lines, container]);
  const changes = lines.map((line) => ({ lineId: line.id, ...states[line.id]! }));
  const progress = returnProgress(lines, changes, codes, container?.code ?? null);
  const marked = changes.reduce((sum, c) => sum + c.returned + c.damaged + c.lost, 0);
  const placed = changes.every((c) => c.returned + c.damaged === 0 || c.locationId);
  const ready = marked > 0 && placed && progress.done && photos.length >= Math.max(1, minPhotos) && remarks.trim().length > 0;

  return (
    <Card as="section" aria-label="Take back">
      <CardHeader title="Take back" description="Mark what came back, scan it, photograph it and note its condition. Damaged or lost units open an incident." />
      <div className="flex flex-col gap-6">
        <section aria-label="1. What came back" className="flex flex-col gap-3">
          <h3 className="text-overline text-ink-muted">1. What came back</h3>
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {lines.map((line) => <ReturnLineRow key={line.id} line={line} state={states[line.id]!} locations={locations} onChange={(next) => setStates((s) => ({ ...s, [line.id]: next }))} />)}
          </ul>
        </section>
        <section aria-label="2. Scan" className="flex flex-col gap-3">
          <h3 className="text-overline text-ink-muted">2. Scan</h3>
          <Scanner codes={codes} onChange={setCodes} known={known} />
          <ScanChecklist lines={progress.lines} extra={progress.containerNeeded && container ? { label: container.label, done: progress.containerScanned } : null} />
        </section>
        <section aria-label="3. Photos and remarks" className="flex flex-col gap-4">
          <h3 className="text-overline text-ink-muted">3. Photos and remarks</h3>
          <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
          <Field label="Remarks" required helperText="Always required: the condition of what came back, and what happened to anything missing.">
            <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} />
          </Field>
        </section>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {!ready ? <p className="text-caption text-ink-muted">Mark at least one unit, finish the scans, photos and remarks to save.</p> : null}
          <Button
            variant="primary"
            size="lg"
            loading={pending}
            disabled={!ready}
            onClick={() => {
              const payload = { loanId, scannedCodes: codes, remarks, lines: changes.filter((c) => c.returned + c.damaged + c.lost > 0).map((c) => ({ lineId: c.lineId, returned: c.returned, damaged: c.damaged, lost: c.lost, locationId: c.locationId || null })) };
              void run(() => returnLoanAction(slug, handoverFormData(payload, photos)), "Return recorded.");
            }}
          >
            Record return
          </Button>
        </div>
      </div>
    </Card>
  );
}
