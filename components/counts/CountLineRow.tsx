"use client";

import { useId, useState } from "react";
import { recordCountAction, refreshCountLineAction } from "@/app/actions/counts";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { varianceLabel, wholeNumber } from "@/lib/desk/format";
import type { CountLineView } from "@/lib/desk/countsDetail";
import { COUNT_QUANTITY_MAX, recordCountSchema } from "@/lib/desk/countSchemas";

function focusNext(current: HTMLInputElement) {
  const inputs = [...document.querySelectorAll<HTMLInputElement>("input[data-count-input]")];
  const next = inputs[inputs.indexOf(current) + 1];
  next?.focus();
  next?.select();
}

/** One item at one location: the counted number (Enter saves and moves on), expected and variance when visible. */
export function CountLineRow({ slug, countId, line, editable }: { slug: string; countId: string; line: CountLineView; editable: boolean }) {
  const { run, pending, error } = useActionRunner();
  const [value, setValue] = useState(line.countedQty === null ? "" : String(line.countedQty));
  const parsed = wholeNumber(value);
  const validation = value ? recordCountSchema.shape.counted.safeParse(parsed) : null;
  const fieldError = validation && !validation.success ? validation.error.issues[0]!.message : null;
  const errorId = useId();
  const changed = parsed !== null && !fieldError && parsed !== line.countedQty;
  const unit = line.unit ? ` ${line.unit}` : "";
  const found = line.countedQty ?? (line.serialized && line.scannedTags.length > 0 ? line.scannedTags.length : null);

  const save = (input?: HTMLInputElement) => {
    if (parsed === null || !changed) {
      if (input) focusNext(input);
      return;
    }
    void run(() => recordCountAction(slug, { countId, lineId: line.id, counted: parsed, note: null }), `${line.itemName}: ${parsed}${unit} counted.`).then((ok) => { if (ok && input) focusNext(input); });
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink">{line.itemName}</p>
          <p className="text-caption text-ink-muted">
            {line.sku}
            {line.counterName && line.countedQty !== null ? ` · counted by ${line.counterName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {line.stale ? <Chip tone="warning">Stock moved</Chip> : null}
          {line.expected !== null ? <span className="text-caption tabular-nums text-ink-muted">Expected {line.expected}{unit}</span> : null}
          {line.variance !== null ? <Chip className="tabular-nums" tone={line.variance === 0 ? "success" : "warning"}>{varianceLabel(line.variance, line.unit)}</Chip> : null}
        </div>
      </div>
      {line.serialized ? (
        <p className="text-body-ui text-ink-secondary">
          {line.scannedTags.length ? `Scanned: ${line.scannedTags.join(", ")}` : editable ? "Scan each tag found here, or save 0 if none were found." : "No tags scanned here."}
        </p>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            data-count-input
            type="number"
            min={0}
            max={COUNT_QUANTITY_MAX}
            step={1}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={`Counted ${line.itemName} at ${line.locationPath}`}
            aria-invalid={Boolean(fieldError || error)}
            aria-describedby={fieldError || error ? errorId : undefined}
            value={value}
            placeholder={line.serialized ? "Tags found" : "Count"}
            onFocus={(event) => event.target.select()}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              save(event.currentTarget);
            }}
            className="w-28 text-right tabular-nums"
            disabled={pending}
          />
          <Button variant="secondary" size="sm" onClick={() => save()} loading={pending} disabled={!changed}>
            {line.countedQty === null ? "Save" : "Update"}
          </Button>
          {line.countedQty !== null && !changed ? <Chip tone="success">Counted</Chip> : null}
          {line.stale ? (
            <Button variant="quiet" size="sm" disabled={pending} onClick={() => void run(() => refreshCountLineAction(slug, { countId, lineId: line.id }), "Line refreshed. Count it again.").then((ok) => { if (ok) setValue(""); })}>
              Refresh and recount
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-body-ui tabular-nums text-ink">{found === null ? "Not counted" : `Counted ${found}${unit}`}</p>
      )}
      {fieldError || error ? <p id={errorId} role="alert" className="text-caption text-danger-fg">{fieldError ?? error}</p> : null}
    </li>
  );
}
