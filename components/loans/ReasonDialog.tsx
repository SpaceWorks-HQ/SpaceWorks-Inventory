"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";

/**
 * Ask for a short reason before a refusal or cancellation (destructive look,
 * so it never passes for the primary action).
 */
export function ReasonDialog({ open, onOpenChange, title, description, label, confirmLabel, required, pending, error, onConfirm }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  label: string;
  confirmLabel: string;
  required: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent size="sm">
        <DialogHeader title={title} description={description} />
        <DialogBody className="flex flex-col gap-3">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <Field label={label} optional={!required}>
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Keep it</Button>
          <Button variant="dangerSolid" loading={pending} disabled={required && !reason.trim()} onClick={() => onConfirm(reason.trim())}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
