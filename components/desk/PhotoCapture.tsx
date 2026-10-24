"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Image from "next/image";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatBytes } from "@/lib/desk/format";

const MAX_SIDE = 2000;

/** Shrink a phone photo before upload (keeps handovers under the action body limit). Falls back to the original. */
async function downscale(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 2_500_000) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file;
  }
}

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  /** Photos the space requires for this step. */
  min: number;
  max?: number;
  label?: string;
  disabled?: boolean;
};

/**
 * Evidence photos from the phone camera (or the gallery): previews, size,
 * remove, and a count against the space's minimum.
 */
export function PhotoCapture({ files, onChange, min, max = 6, label = "Photos", disabled = false }: Props) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);
  const required = Math.max(1, min);
  const short = files.length < required;

  const add = async (picked: FileList | null) => {
    if (!picked?.length) return;
    setError(null);
    const images = [...picked].filter((file) => file.type.startsWith("image/"));
    if (images.length < picked.length) setError("Only photos can be attached.");
    const room = max - files.length;
    if (images.length > room) setError(`Attach at most ${max} photos.`);
    setBusy(true);
    try {
      const prepared = await Promise.all(images.slice(0, Math.max(0, room)).map(downscale));
      onChange([...files, ...prepared]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-label text-ink">{label}</p>
          <p className="text-caption text-ink-muted">
            {short ? `Take at least ${required} ${required === 1 ? "photo" : "photos"} of the items.` : `${files.length} of up to ${max} photos.`}
          </p>
        </div>
        <label htmlFor={inputId} aria-disabled={disabled || busy || files.length >= max} className={buttonClasses({ variant: "secondary", className: "cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--yy-focus)]" })}>
          {busy ? "Preparing photos" : files.length ? "Add another photo" : "Take photo"}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            disabled={disabled || busy || files.length >= max}
            onChange={(event) => {
              void add(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {error ? <p role="alert" className="text-caption text-danger-fg">{error}</p> : null}
      {files.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-line bg-panel p-2">
              <span className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-surface">
                {urls[index] ? <Image src={urls[index]} alt={`Photo ${index + 1}`} width={240} height={240} unoptimized className="max-h-full w-auto object-contain" /> : null}
              </span>
              <span className="flex items-center justify-between gap-1">
                <span className="truncate text-caption tabular-nums text-ink-muted">{formatBytes(file.size)}</span>
                <Button variant="dangerQuiet" size="sm" disabled={disabled} onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Remove photo ${index + 1}`}>Remove</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
