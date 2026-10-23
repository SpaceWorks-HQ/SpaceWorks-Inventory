"use client";

import { useState } from "react";
import { createContainersAction } from "@/app/actions/catalogue";
import { StockDialog } from "@/components/stock/StockDialog";
import { Field, Input } from "@/components/ui/field";
import { useRunAction } from "./useRunAction";

/** Make numbered QR-labelled bags or boxes (BOX-001, BOX-002, …) that loans are packed into. */
export function ContainersDialog({ open, onOpenChange, slug }: { open: boolean; onOpenChange: (open: boolean) => void; slug: string }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const [count, setCount] = useState("10");
  const [name, setName] = useState("");
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    const amount = /^\d{1,3}$/.test(count.trim()) ? Number(count.trim()) : 0;
    if (amount < 1 || amount > 100) return setError("Create between 1 and 100 containers at a time.");
    run(() => createContainersAction(slug, { count: amount, name }), (data) => `Created ${data?.count ?? amount} containers.`, () => onOpenChange(false));
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Create containers" description="Each gets the next BOX number and its own QR label." submitLabel="Create containers" pending={pending} error={error} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How many" required>
          <Input inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} autoFocus />
        </Field>
        <Field label="Name" optional helperText="For example Small tote.">
          <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
        </Field>
      </div>
    </StockDialog>
  );
}
