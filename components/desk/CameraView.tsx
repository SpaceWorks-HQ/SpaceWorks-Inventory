"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Callout } from "@/components/ui/display";

/** Plain-language reasons the camera didn't start. */
export function cameraErrorMessage(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : "";
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (typeof window !== "undefined" && !window.isSecureContext) return "The camera only works over a secure (https) connection. Type the code under the label instead.";
  if (name === "NotAllowedError" || /permission|denied|not allowed/i.test(text)) return "Camera access is blocked. Allow the camera for this site in your browser settings, then try again, or type the code under the label.";
  if (name === "NotFoundError" || /not found|no camera|requested device/i.test(text)) return "No camera was found on this device. Type the code under the label instead.";
  if (name === "NotReadableError" || /in use|could not start|not readable/i.test(text)) return "The camera is busy in another app or tab. Close it there and try again.";
  return "The camera couldn't start. Try again, or type the code under the label.";
}

type Props = {
  /** Raw text of each QR code read (the same code is reported again only after a pause). */
  onDetected: (text: string) => void;
  onStop: () => void;
};

/**
 * Live camera preview that reads QR codes with html5-qrcode (loaded on
 * demand). Uses the back camera on phones. Unmount it to stop the camera.
 */
export function CameraView({ onDetected, onStop }: Props) {
  const elementId = `sw-camera-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const detected = useRef(onDetected);
  const last = useRef<{ text: string; at: number } | null>(null);

  useEffect(() => {
    detected.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let cancelled = false;
    let scanner: { stop: () => Promise<void>; clear: () => void; isScanning: boolean } | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("not found");
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(elementId, { verbose: false });
        scanner = instance;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: (width, height) => { const side = Math.floor(Math.min(width, height) * 0.7); return { width: side, height: side }; } },
          (text) => {
            const now = Date.now();
            if (last.current && last.current.text === text && now - last.current.at < 2500) return;
            last.current = { text, at: now };
            detected.current(text);
          },
          undefined,
        );
        if (cancelled) await instance.stop().catch(() => undefined);
        else setStarting(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cameraErrorMessage(cause));
          setStarting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      const running = scanner;
      if (running?.isScanning) running.stop().then(() => running.clear()).catch(() => undefined);
    };
  }, [elementId]);

  if (error) {
    return (
      <Callout tone="warning" role="alert" title="Camera unavailable" action={<button type="button" onClick={onStop} className="min-h-11 rounded-md px-3 text-sm font-semibold underline underline-offset-4">Close</button>}>
        {error}
      </Callout>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-inverse">
      <div id={elementId} className="mx-auto w-full max-w-md [&_video]:block [&_video]:w-full" />
      {starting ? <p role="status" className="px-4 py-3 text-body-ui text-on-inverse">Starting the camera. Allow access if your browser asks.</p> : (
        <p className="px-4 py-3 text-body-ui text-on-inverse">Point the camera at a QR label. Each code is added once.</p>
      )}
    </div>
  );
}
