"use client";

import { useMemo, useState } from "react";
import { issueLoanAction } from "@/app/actions/loans";
import { resolveIssueScanAction } from "@/app/actions/scan";
import { DeskStepper } from "@/components/desk/DeskStepper";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { useShowDone } from "@/components/desk/useShowDone";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";
import { issueProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { evidenceHint } from "@/lib/desk/stepper";
import { ScanChecklist } from "./ScanChecklist";

type Assets = Record<string, { itemId: string; label: string }>;
type Containers = { code: string; label: string }[];
type Props = {
  slug: string;
  loanId: string;
  lines: HandoverLine[];
  assets: Assets;
  containers: Containers;
  minPhotos: number;
  requireRemarks: boolean;
  requireContainer: boolean;
  blocked: string | null;
  paymentReady: boolean;
  unavailable: Record<string, string>;
};

/** Hand an approved loan over: scan → check the lines → photos and remarks → done. */
export function IssueFlow({ slug, loanId, lines, assets, containers, minPhotos, requireRemarks, requireContainer, blocked, paymentReady, unavailable }: Props) {
  const [codes, setCodes] = useState<string[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  // Codes the server resolved on demand: the page preloads only part of a large space's tags.
  const [found, setFound] = useState<{ assets: Assets; containers: Containers; unavailable: Record<string, string> }>({ assets: {}, containers: [], unavailable: {} });
  const { run, pending, error } = useActionRunner();
  const showDone = useShowDone();
  const allAssets = useMemo(() => ({ ...assets, ...found.assets }), [assets, found.assets]);
  const allContainers = useMemo(() => [...containers, ...found.containers], [containers, found.containers]);
  const allUnavailable = { ...unavailable, ...found.unavailable };
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const line of lines) if (line.tracking === "QUANTITY") map[line.itemCode] = `${line.name} (item label)`;
    for (const [code, asset] of Object.entries(allAssets)) map[code] = asset.label;
    for (const container of allContainers) map[container.code] = container.label;
    return map;
  }, [lines, allAssets, allContainers]);
  const resolve = async (code: string) => {
    const result = await resolveIssueScanAction(slug, { recordId: loanId, code });
    const scan = result.ok ? result.data : null;
    if (!scan) return null;
    setFound((current) => scan.unavailable ? { ...current, unavailable: { ...current.unavailable, [code]: scan.label } }
      : scan.kind === "asset" && scan.itemId ? { ...current, assets: { ...current.assets, [code]: { itemId: scan.itemId, label: scan.label } } }
        : { ...current, containers: [...current.containers, { code, label: scan.label }] });
    return { label: scan.label, unavailable: scan.unavailable };
  };

  const progress = issueProgress(lines, codes, { assets: allAssets, containerCodes: allContainers.map((c) => c.code) });
  const containerMissing = requireContainer && !progress.containerScanned;
  const unavailableScanned = codes.some((code) => Boolean(allUnavailable[code]));
  const scansComplete = !unavailableScanned && progress.done && !containerMissing;
  const evidenceReady = photos.length >= Math.max(1, minPhotos) && (!requireRemarks || remarks.trim().length > 0);
  const ready = paymentReady && !blocked && scansComplete && evidenceReady;
  const linesHint = progress.lines.find((line) => line.have > line.need)?.hint ?? (containerMissing ? "Scan the container: this space requires one." : "Go back and scan the rest of the lines.");

  return (
    <DeskStepper
      label="Hand over"
      title="Hand over"
      description="Scan every asset tag and each item label (or the container they're packed in), then photograph the items."
      notice={blocked ? <Callout tone="warning" title="Not ready to hand over">{blocked}</Callout> : null}
      error={error}
      steps={[
        {
          title: "Scan",
          ready: codes.length > 0 && !unavailableScanned,
          hint: unavailableScanned ? "Remove unavailable tags." : "Scan at least one label to continue.",
          content: <Scanner codes={codes} onChange={setCodes} known={known} unavailable={allUnavailable} resolve={resolve} />,
        },
        {
          title: "Check the lines",
          ready: scansComplete,
          hint: unavailableScanned ? "Remove unavailable tags." : linesHint,
          content: <ScanChecklist lines={progress.lines} extra={requireContainer ? { label: "Container (required in this space)", done: progress.containerScanned } : null} />,
        },
        {
          title: "Photos and remarks",
          ready: evidenceReady,
          hint: evidenceHint(minPhotos, requireRemarks),
          content: (
            <>
              <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
              <Field label="Remarks" optional={!requireRemarks} helperText="Condition, missing accessories, anything the next person should know.">
                <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={3} />
              </Field>
            </>
          ),
        },
      ]}
      finishHint={blocked ?? (!paymentReady ? "Take the payment first." : !scansComplete ? linesHint : null)}
      finish={(
        <Button variant="primary" size="lg" loading={pending} disabled={!ready} onClick={() => void run(() => issueLoanAction(slug, handoverFormData({ loanId, scannedCodes: codes, remarks }, photos)), "Loan issued.", () => showDone("issue"))}>
          Issue loan
        </Button>
      )}
    />
  );
}
