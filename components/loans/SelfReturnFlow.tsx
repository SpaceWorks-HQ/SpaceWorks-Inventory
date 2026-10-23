"use client";

import { useMemo, useState } from "react";
import { selfReturnAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { returnProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { ScanChecklist } from "./ScanChecklist";

/** A self-checkout borrower brings everything back: scan each label, photograph, note the condition. */
export function SelfReturnFlow({ slug, loanId, lines, minPhotos }: { slug: string; loanId: string; lines: Array<HandoverLine & { label: string }>; minPhotos: number }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  const known = useMemo(() => Object.fromEntries(lines.map((line) => (line.assetCode ? [line.assetCode, line.label] : [line.itemCode, `${line.name} (item label)`]))), [lines]);
  const changes = lines.map((line) => ({ lineId: line.id, returned: line.units, damaged: 0, lost: 0 }));
  const progress = returnProgress(lines, changes, codes, null);
  const ready = progress.done && photos.length >= Math.max(1, minPhotos) && remarks.trim().length > 0;

  return (
    <Card as="section" aria-label="Return it yourself">
      <CardHeader title="Return it yourself" description="Put everything back where you found it, then scan each label, take a photo and say what condition it's in. Anything damaged or missing: return it at the desk instead." />
      <div className="flex flex-col gap-6">
        <Scanner codes={codes} onChange={setCodes} known={known} title="What you're returning" />
        <ScanChecklist lines={progress.lines} />
        <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
        <Field label="Remarks" required helperText="For example: all bits back in the case, battery charged.">
          <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={2} />
        </Field>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Button variant="primary" size="lg" className="self-end" loading={pending} disabled={!ready} onClick={() => void run(() => selfReturnAction(slug, handoverFormData({ loanId, scannedCodes: codes, remarks }, photos)), "Returned. Thanks for bringing it back.")}>
          Return everything
        </Button>
      </div>
    </Card>
  );
}
