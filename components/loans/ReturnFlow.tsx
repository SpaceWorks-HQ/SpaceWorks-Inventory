"use client";

import { useMemo, useState } from "react";
import { returnLoanAction } from "@/app/actions/loans";
import { DeskStepper } from "@/components/desk/DeskStepper";
import { handoverFormData } from "@/components/desk/handoverForm";
import type { LocationOption } from "@/components/desk/LocationPicker";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { useShowDone } from "@/components/desk/useShowDone";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { clampReturnChange, returnProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { evidenceHint } from "@/lib/desk/stepper";
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
  const [saved, setSaved] = useState(false);
  const [confirmLoss, setConfirmLoss] = useState(false);
  const { run, pending, error } = useActionRunner();
  const showDone = useShowDone();
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of lines) {
      if (line.assetCode) map[line.assetCode] = line.label;
      else map[line.itemCode] = `${line.name} (item label)`;
    }
    if (container) map[container.code] = container.label;
    return map;
  }, [lines, container]);
  const changes = lines.map((line) => clampReturnChange({ lineId: line.id, ...states[line.id]! }, line.outstanding));
  const progress = returnProgress(lines, changes, codes, container?.code ?? null);
  const marked = changes.reduce((sum, c) => sum + c.returned + c.damaged + c.lost, 0);
  const placed = changes.every((c) => c.returned + c.damaged === 0 || c.locationId);
  const completed = [marked > 0 && Boolean(placed), marked > 0 && progress.done, photos.length >= Math.max(1, minPhotos) && remarks.trim().length > 0];
  const ready = !saved && completed.every(Boolean);
  const finishHint = saved ? "Return recorded. Loading the remaining items." : !completed[1] ? "Go back and scan every unit you're taking back." : null;
  const lostUnits = changes.filter((change) => change.lost > 0).map((change) => `${change.lost} × ${lines.find((line) => line.id === change.lineId)!.label}`);
  const submit = () => {
    if (!ready || pending) return;
    const payload = { loanId, scannedCodes: codes, remarks, lines: changes.filter((c) => c.returned + c.damaged + c.lost > 0).map((c) => ({ lineId: c.lineId, returned: c.returned, damaged: c.damaged, lost: c.lost, locationId: c.locationId || null })) };
    void run(() => returnLoanAction(slug, handoverFormData(payload, photos)), "Return recorded.", () => showDone("return")).then((ok) => {
      setConfirmLoss(false);
      if (!ok) return;
      setSaved(true);
      setCodes([]);
      setPhotos([]);
      setRemarks("");
      setStates(Object.fromEntries(lines.map((line) => [line.id, { returned: 0, damaged: 0, lost: 0, locationId: line.locationId ?? "" }])));
    });
  };

  return (
    <>
      <DeskStepper
        label="Take back"
        title="Take back"
        description="Mark what came back, scan it, photograph it and note its condition. Damaged or lost units open an incident."
        error={error}
        steps={[
          {
            title: "What came back",
            ready: completed[0]!,
            hint: marked > 0 ? "Choose where each returned unit goes." : "Mark at least one unit that came back.",
            content: (
              <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
                {lines.map((line) => <ReturnLineRow key={line.id} line={line} state={changes.find((c) => c.lineId === line.id)!} locations={locations} onChange={(next) => setStates((s) => ({ ...s, [line.id]: next }))} />)}
              </ul>
            ),
          },
          {
            title: "Scan",
            ready: completed[1]!,
            hint: "Scan every unit you're taking back.",
            content: (
              <>
                <Scanner codes={codes} onChange={setCodes} known={known} />
                <ScanChecklist lines={progress.lines} extra={progress.containerNeeded && container ? { label: container.label, done: progress.containerScanned } : null} />
              </>
            ),
          },
          {
            title: "Photos and remarks",
            ready: completed[2]!,
            hint: evidenceHint(minPhotos, true),
            content: (
              <>
                <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
                <Field label="Remarks" required helperText="Always required: the condition of what came back, and what happened to anything missing.">
                  <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} />
                </Field>
              </>
            ),
          },
        ]}
        finishHint={finishHint}
        finish={(
          <Button variant={lostUnits.length ? "danger" : "primary"} size="lg" loading={pending} disabled={!ready} onClick={() => lostUnits.length ? setConfirmLoss(true) : submit()}>
            {lostUnits.length ? "Record return with lost units…" : "Record return"}
          </Button>
        )}
      />
      <ConfirmDialog
        open={confirmLoss}
        title="Record lost units?"
        message={`Record ${lostUnits.join(", ")} as lost. This records a stock loss and opens incidents. Replacement charges may be added, and borrowing may be restricted until the incidents are resolved, according to the space's settings.`}
        confirmLabel="Record return with lost units"
        destructive
        loading={pending}
        onCancel={() => setConfirmLoss(false)}
        onConfirm={submit}
      />
    </>
  );
}
