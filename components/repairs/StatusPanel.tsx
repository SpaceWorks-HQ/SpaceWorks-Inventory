"use client";

import { useState } from "react";
import { cancelRepairAction, closeRepairAction, reopenRepairAction, requestRepairPartsAction, respondRepairRequestAction, unassignTechnicianAction } from "@/app/actions/repairs";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import type { RepairDetail } from "@/lib/repairs/views";

type Mode = null | "close" | "scrap" | "reopen" | "cancel" | "unassign" | "parts";

const PROMPT: Record<Exclude<Mode, null>, { label: string; field: string; button: string; danger?: boolean }> = {
  close: { label: "Closing note (optional)", field: "note", button: "Verify and close" },
  scrap: { label: "Why it can't be repaired", field: "note", button: "Scrap it", danger: true },
  reopen: { label: "What still needs doing", field: "reason", button: "Reopen" },
  cancel: { label: "Why the repair is cancelled", field: "reason", button: "Cancel repair", danger: true },
  unassign: { label: "Why the technician is taken off", field: "reason", button: "Unassign", danger: true },
  parts: { label: "Part needed", field: "name", button: "Add to the buy list" },
};

/** What happens next: answer a request (technicians), or verify, close, reopen and cancel (inventory managers). */
export function StatusPanel({ slug, repair, manage, respond }: { slug: string; repair: RepairDetail; manage: boolean; respond: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [quantity, setQuantity] = useState("1");
  const { run, pending, error } = useActionRunner();
  const issueId = repair.id;
  const open = repair.status === "REPORTED" || repair.status === "ASSIGNED" || repair.status === "FIXED";

  const answer = (accept: boolean) => run(() => respondRepairRequestAction(slug, { issueId, requestId: repair.myRequest!.id, accept, reason: accept ? null : text || null }), accept ? "You took the repair." : "Request declined.");

  const confirm = () => {
    if (!mode) return;
    const done = () => { setMode(null); setText(""); };
    const work = {
      close: () => closeRepairAction(slug, { issueId, outcome: "FIXED", note: text }),
      scrap: () => closeRepairAction(slug, { issueId, outcome: "SCRAPPED", note: text }),
      reopen: () => reopenRepairAction(slug, { issueId, reason: text }),
      cancel: () => cancelRepairAction(slug, { issueId, reason: text }),
      unassign: () => unassignTechnicianAction(slug, { issueId, reason: text }),
      parts: () => requestRepairPartsAction(slug, { issueId, name: text, quantity: Number(quantity) || 1, note: null }),
    }[mode];
    void run(work, { close: "Repair closed.", scrap: "Repair closed as scrapped.", reopen: "Repair reopened.", cancel: "Repair cancelled.", unassign: "Technician unassigned.", parts: "Added to the buy list." }[mode]).then((ok) => ok && done());
  };

  const showRespond = repair.myRequest?.status === "SENT" && repair.status === "REPORTED" && respond;
  if (!showRespond && !(manage && open)) return null;

  return (
    <Card as="section" aria-label="Next step">
      <CardHeader title="Next step" titleAs="h2" />
      <div className="flex flex-col gap-3">
        {showRespond ? (
          <>
            <p className="text-body-ui text-ink-secondary">You were asked to take this repair. The first technician to accept gets it.</p>
            <Button variant="primary" loading={pending} onClick={() => void answer(true)}>Accept the repair</Button>
            <Field label="Reason (optional)"><Input value={text} onChange={(event) => setText(event.target.value)} maxLength={500} /></Field>
            <Button variant="secondary" disabled={pending} onClick={() => void answer(false)}>Decline</Button>
          </>
        ) : null}
        {manage && open && !mode ? (
          <div className="flex flex-col gap-2">
            {repair.status === "FIXED" ? <Button variant="primary" onClick={() => setMode("close")}>Verify and close</Button> : null}
            {repair.status === "FIXED" ? <Button variant="secondary" onClick={() => setMode("reopen")}>Reopen</Button> : null}
            {repair.status === "ASSIGNED" ? <Button variant="secondary" onClick={() => setMode("unassign")}>Unassign the technician</Button> : null}
            <Button variant="secondary" onClick={() => setMode("parts")}>Add a part to the buy list</Button>
            <Button variant="secondary" onClick={() => setMode("scrap")}>Can&apos;t be repaired</Button>
            {!repair.money?.payouts.length ? <Button variant="danger" onClick={() => setMode("cancel")}>Cancel the repair</Button> : null}
          </div>
        ) : null}
        {mode ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); confirm(); }}>
            <Field label={PROMPT[mode].label} optional={mode === "close"}>
              {mode === "parts" ? <Input value={text} onChange={(event) => setText(event.target.value)} maxLength={120} required /> : <Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={1000} rows={3} required={mode !== "close"} />}
            </Field>
            {mode === "parts" ? <Field label="Quantity"><Input type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant={PROMPT[mode].danger ? "danger" : "primary"} loading={pending}>{PROMPT[mode].button}</Button>
              <Button variant="secondary" disabled={pending} onClick={() => { setMode(null); setText(""); }}>Back</Button>
            </div>
          </form>
        ) : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </div>
    </Card>
  );
}
