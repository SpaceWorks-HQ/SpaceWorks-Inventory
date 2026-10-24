"use client";

import { useState, type ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { normalizeScan } from "@/lib/desk/scanCodes";
import { CameraView } from "./CameraView";

export type ScanFeedback = { tone: "success" | "warning"; text: string } | null;

type Props = {
  /** A valid Space Works code was scanned or typed. Return feedback to show. */
  onCode: (code: string) => ScanFeedback | void | Promise<ScanFeedback | void>;
  label?: ReactNode;
  helper?: ReactNode;
  disabled?: boolean;
  /** Start with the camera open (phones at the desk). */
  autoCamera?: boolean;
};

/**
 * The scan step of every desk flow: the phone camera with a typed fallback
 * (the code printed under each QR label, or a /q/ link). Confirms each scan
 * in words, never with a sound.
 */
export function ScanField({ onCode, label = "Code under the label", helper = "Type or paste the code if the camera can't read the label.", disabled = false, autoCamera = false }: Props) {
  const [camera, setCamera] = useState(autoCamera);
  const [typed, setTyped] = useState("");
  const [feedback, setFeedback] = useState<ScanFeedback>(null);
  const [busy, setBusy] = useState(false);

  const accept = async (raw: string) => {
    const code = normalizeScan(raw);
    if (!code) {
      setFeedback({ tone: "warning", text: "That isn't a Space Works QR code. Scan the label again or check the typed code." });
      return false;
    }
    setBusy(true);
    try {
      const result = await onCode(code);
      setFeedback(result ?? { tone: "success", text: `Scanned ${code}.` });
    } finally {
      setBusy(false);
    }
    return true;
  };

  const submitTyped = async () => {
    if (!typed.trim()) return;
    if (await accept(typed)) setTyped("");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => setCamera((open) => !open)} disabled={disabled} aria-pressed={camera}>
          {camera ? "Stop camera" : "Scan with camera"}
        </Button>
      </div>
      {camera && !disabled ? <CameraView onDetected={(text) => void accept(text)} onStop={() => setCamera(false)} /> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Field label={label} className="min-w-0 flex-1">
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              // Scanners that type like a keyboard end with Enter; never submit the surrounding form.
              if (event.key !== "Enter") return;
              event.preventDefault();
              void submitTyped();
            }}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text" maxLength={300} disabled={disabled} placeholder="e.g. A7K2M9Q4R8T3W5Y6"
          />
        </Field>
        <Button variant="secondary" onClick={() => void submitTyped()} disabled={disabled || !typed.trim()} loading={busy}>Add code</Button>
      </div>
      {helper ? <p className="-mt-1 text-caption text-ink-muted">{helper}</p> : null}
      <p aria-live="polite" role="status" className={cn("flex min-h-6 items-start gap-2 text-body-ui", feedback?.tone === "warning" ? "text-danger-fg" : "text-ink")}>
        {feedback ? (
          <>
            <span aria-hidden className="mt-0.5 inline-flex [&_svg]:size-4">{feedback.tone === "success" ? <CircleCheck /> : <TriangleAlert />}</span>
            <span>{feedback.text}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}
