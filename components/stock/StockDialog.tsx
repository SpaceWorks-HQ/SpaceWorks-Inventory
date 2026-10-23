"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";

export type LocationOption = { id: string; label: string };
/** One location's balance for an item, as the dialogs need it. */
export type LevelOption = { locationId: string; label: string; onHand: number; available: number; quarantined: number };

/** Positive whole number from a text field, or null. */
export function parseWhole(value: string) {
  const trimmed = value.trim();
  return /^\d{1,7}$/.test(trimmed) && Number(trimmed) > 0 ? Number(trimmed) : null;
}

/** The shared shell of every stock dialog: title, fields, the refusal and two buttons. */
export function StockDialog({ open, onOpenChange, title, description, submitLabel, pending, error, onSubmit, children, destructive = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; submitLabel: string;
  pending: boolean; error: string | null; onSubmit: () => void; children: ReactNode; destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader title={title} description={description} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onSubmit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            {error ? <Callout tone="danger" role="alert" title={error} /> : null}
            {children}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant={destructive ? "dangerSolid" : "primary"} loading={pending}>{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
