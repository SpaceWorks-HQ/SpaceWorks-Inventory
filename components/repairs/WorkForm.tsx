"use client";

import { useState } from "react";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { currencyMinorDigits } from "@/lib/format/money";
import { moneyInputValue } from "@/lib/format/quantity";

export type WorkPayload = { remarks: string; partsUsed: string | null; amountAsked: string | null; markFixed: boolean };

/**
 * Fix notes, parts, photos and the amount asked. Shared by the repair page
 * (member technicians and managers) and an external technician's link page.
 */
export function WorkForm({ currency, remarks, partsUsed, askedMinor, pending, error, onSubmit }: { currency: string; remarks: string; partsUsed: string; askedMinor: number | null; pending: boolean; error: string | null; onSubmit: (payload: WorkPayload, photos: File[]) => void }) {
  const [notes, setNotes] = useState(remarks);
  const [parts, setParts] = useState(partsUsed);
  const [amount, setAmount] = useState(moneyInputValue(askedMinor, currencyMinorDigits(currency)));
  const [photos, setPhotos] = useState<File[]>([]);
  const submit = (markFixed: boolean) => onSubmit({ remarks: notes, partsUsed: parts || null, amountAsked: amount || null, markFixed }, photos);
  return (
    <form className="mt-4 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); submit(false); }}>
      <Field label="What you did" helperText="Required before you mark it fixed.">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} />
      </Field>
      <Field label="Parts used" optional>
        <Input value={parts} onChange={(event) => setParts(event.target.value)} maxLength={1000} />
      </Field>
      <Field label={`Amount you ask (${currency})`} optional helperText="Labour and parts together. The space approves it before paying.">
        <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
      </Field>
      <PhotoCapture files={photos} onChange={setPhotos} min={0} max={6} label="Photos of the fix (optional)" disabled={pending} />
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" loading={pending} onClick={() => submit(true)}>Mark it fixed</Button>
        <Button type="submit" variant="secondary" disabled={pending}>Save notes</Button>
      </div>
    </form>
  );
}
