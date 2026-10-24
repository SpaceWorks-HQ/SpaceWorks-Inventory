"use client";

import { useState } from "react";
import { respondByLinkAction, saveWorkByLinkAction } from "@/app/actions/repairLink";
import { handoverFormData } from "@/components/desk/handoverForm";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { WorkForm } from "./WorkForm";

/** Accept or decline through the link, then record the work. */
export function RepairLinkActions({ token, mode, currency, remarks, partsUsed, askedMinor }: { token: string; mode: "respond" | "work"; currency: string; remarks: string; partsUsed: string; askedMinor: number | null }) {
  const [reason, setReason] = useState("");
  const { run, pending, error } = useActionRunner();
  if (mode === "work") {
    return (
      <WorkForm
        currency={currency}
        remarks={remarks}
        partsUsed={partsUsed}
        askedMinor={askedMinor}
        pending={pending}
        error={error}
        onSubmit={(payload, photos) => void run(() => saveWorkByLinkAction(handoverFormData({ token, ...payload }, photos)), payload.markFixed ? "Marked fixed. The space will check it." : "Notes saved.")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Button variant="primary" loading={pending} onClick={() => void run(() => respondByLinkAction({ token, accept: true }), "The repair is yours.")}>Accept the repair</Button>
      <Field label="Reason for declining" optional><Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} /></Field>
      <Button variant="secondary" disabled={pending} onClick={() => void run(() => respondByLinkAction({ token, accept: false, reason: reason || null }), "Request declined. Thank you.")}>Decline</Button>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
    </div>
  );
}
