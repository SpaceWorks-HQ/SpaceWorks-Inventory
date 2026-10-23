"use client";

import { useMemo, useState } from "react";
import { issueLoanAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { StepHeading } from "@/components/desk/StepHeading";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { issueProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { ScanChecklist } from "./ScanChecklist";

type Props = {
  slug: string;
  loanId: string;
  lines: HandoverLine[];
  assets: Record<string, { itemId: string; label: string }>;
  containers: { code: string; label: string }[];
  minPhotos: number;
  requireRemarks: boolean;
  requireContainer: boolean;
  blocked: string | null;
  paymentReady: boolean;
  unavailable: Record<string, string>;
};

/** Hand an approved loan over: scan → check lines → photos and remarks → issue. */
export function IssueFlow({ slug, loanId, lines, assets, containers, minPhotos, requireRemarks, requireContainer, blocked, paymentReady, unavailable }: Props) {
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of lines) if (line.tracking === "QUANTITY") map[line.itemCode] = `${line.name} (item label)`;
    for (const [code, asset] of Object.entries(assets)) map[code] = asset.label;
    for (const container of containers) map[container.code] = container.label;
    return map;
  }, [lines, assets, containers]);
  const progress = issueProgress(lines, codes, { assets, containerCodes: containers.map((c) => c.code) });
  const containerMissing = requireContainer && !progress.containerScanned;
  const unavailableScanned = codes.some((code) => Boolean(unavailable[code]));
  const scansComplete = !unavailableScanned && progress.done && !containerMissing;
  const completed = [scansComplete, scansComplete, photos.length >= Math.max(1, minPhotos) && (!requireRemarks || remarks.trim().length > 0)];
  const ready = paymentReady && completed.every(Boolean);

  return (
    <Card as="section" aria-label="Hand over">
      <CardHeader title="Hand over" description="Scan every asset tag and each item label (or the container they're packed in), then photograph the items." />
      <div className="flex flex-col gap-6">
        {blocked ? <Callout tone="warning" title="Not ready to hand over">{blocked}</Callout> : null}
        <section aria-label="1. Scan" className="flex flex-col gap-3">
          <StepHeading step={1} completed={completed}>Scan</StepHeading>
          <Scanner codes={codes} onChange={setCodes} known={known} unavailable={unavailable} />
        </section>
        <section aria-label="2. Check the lines" className="flex flex-col gap-3">
          <StepHeading step={2} completed={completed}>Check the lines</StepHeading>
          <ScanChecklist lines={progress.lines} extra={requireContainer ? { label: "Container (required in this space)", done: progress.containerScanned } : null} />
        </section>
        <section aria-label="3. Photos and remarks" className="flex flex-col gap-4">
          <StepHeading step={3} completed={completed}>Photos and remarks</StepHeading>
          <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
          <Field label="Remarks" optional={!requireRemarks} helperText="Condition, missing accessories, anything the next person should know.">
            <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} />
          </Field>
        </section>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {blocked || !ready ? <p className="text-caption text-ink-muted">{blocked ?? (!paymentReady ? "Take the payment first." : unavailableScanned ? "Remove unavailable tags." : progress.lines.find((line) => line.have > line.need)?.hint ?? "Finish the scans, photos and required remarks to issue.")}</p> : null}
          <Button variant="primary" size="lg" loading={pending} disabled={!ready || Boolean(blocked)} onClick={() => void run(() => issueLoanAction(slug, handoverFormData({ loanId, scannedCodes: codes, remarks }, photos)), "Loan issued.")}>
            Issue loan
          </Button>
        </div>
      </div>
    </Card>
  );
}
