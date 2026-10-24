"use client";

import { useMemo, useState } from "react";
import { selfReturnAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { DeskStepper } from "@/components/desk/DeskStepper";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { useShowDone } from "@/components/desk/useShowDone";
import { evidenceHint } from "@/lib/desk/stepper";
import { Button } from "@/components/ui/button";

import { Field, Textarea } from "@/components/ui/field";
import { returnProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { ScanChecklist } from "./ScanChecklist";

/** A self-checkout borrower brings everything back: scan each label, photograph, note the condition. */
export function SelfReturnFlow({ slug, loanId, lines, minPhotos }: { slug: string; loanId: string; lines: Array<HandoverLine & { label: string }>; minPhotos: number }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  const showDone = useShowDone();
  const known = useMemo(() => Object.fromEntries(lines.map((line) => (line.assetCode ? [line.assetCode, line.label] : [line.itemCode, `${line.name} (item label)`]))), [lines]);
  const changes = lines.map((line) => ({ lineId: line.id, returned: line.units, damaged: 0, lost: 0 }));
  const progress = returnProgress(lines, changes, codes, null);
  const completed = [progress.done, progress.done, photos.length >= Math.max(1, minPhotos) && remarks.trim().length > 0];
  const ready = completed.every(Boolean);

  return (
    <DeskStepper
      label="Return it yourself"
      title="Return it yourself"
      description="Put everything back where you found it, then scan each label, take a photo and say what condition it's in. Anything damaged or missing: return it at the desk instead."
      error={error}
      steps={[
        { title: "Scan", ready: codes.length > 0, hint: "Scan at least one label to continue.", content: <Scanner codes={codes} onChange={setCodes} known={known} title="What you're returning" /> },
        { title: "Check the lines", ready: progress.done, hint: "Go back and scan everything you're returning.", content: <ScanChecklist lines={progress.lines} /> },
        {
          title: "Photos and remarks",
          ready: completed[2]!,
          hint: evidenceHint(minPhotos, true),
          content: (
            <>
              <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
              <Field label="Remarks" required helperText="For example: all bits back in the case, battery charged.">
                <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={2} />
              </Field>
            </>
          ),
        },
      ]}
      finishHint={ready ? null : "Go back and scan everything you're returning."}
      finish={(
        <Button variant="primary" size="lg" loading={pending} disabled={!ready} onClick={() => void run(() => selfReturnAction(slug, handoverFormData({ loanId, scannedCodes: codes, remarks }, photos)), "Returned. Thanks for bringing it back.", () => showDone("self-return"))}>
          Return everything
        </Button>
      )}
    />
  );
}
