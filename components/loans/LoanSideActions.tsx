"use client";

import { useState } from "react";
import { cancelLoanAction, renewLoanAction, setDueDateAction } from "@/app/actions/loans";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { ReasonDialog } from "./ReasonDialog";

/** Renew, move the due date or cancel a ready loan (staff). */
export function LoanSideActions({ slug, loanId, canRenew, renewHint, renewReason, canSetDue, dueValue, canCancel }: {
  slug: string; loanId: string; canRenew: boolean; renewHint: string; renewReason: string | null; canSetDue: boolean; dueValue: string; canCancel: boolean;
}) {
  const [dialog, setDialog] = useState<"due" | "cancel" | null>(null);
  const [due, setDue] = useState(dueValue);
  const renew = useActionRunner();
  const change = useActionRunner();
  if (!canRenew && !renewReason && !canSetDue && !canCancel) return null;
  return (
    <Card as="section" aria-label="Loan actions">
      <CardHeader title="Loan actions" />
      <div className="flex flex-col gap-2">
        {renew.error ? <Callout tone="danger" role="alert">{renew.error}</Callout> : null}
        {renewReason ? <p className="text-caption text-ink-muted">{renewReason}</p> : null}
        {canRenew ? (
          <>
            <Button variant="secondary" fullWidth loading={renew.pending} onClick={() => void renew.run(() => renewLoanAction(slug, { loanId }), "Loan renewed.")}>Renew</Button>
            <p className="text-caption text-ink-muted">{renewHint}</p>
          </>
        ) : null}
        {canSetDue ? <Button variant="secondary" fullWidth onClick={() => { change.setError(null); setDialog("due"); }}>Change due date</Button> : null}
        {canCancel ? <Button variant="dangerQuiet" fullWidth onClick={() => { change.setError(null); setDialog("cancel"); }}>Cancel loan…</Button> : null}
      </div>
      <Dialog open={dialog === "due"} onOpenChange={(open) => { if (!change.pending) setDialog(open ? "due" : null); }}>
        <DialogContent size="sm">
          <DialogHeader title="Change the due date" description="The member is told about the new date. Reminders start again." />
          <DialogBody className="flex flex-col gap-3">
            {change.error ? <Callout tone="danger" role="alert">{change.error}</Callout> : null}
            <Field label="Due back on"><Input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={change.pending}>Cancel</Button>
            <Button variant="primary" loading={change.pending} disabled={!due} onClick={() => void change.run(() => setDueDateAction(slug, { loanId, dueDate: due }), "Due date changed.").then((ok) => { if (ok) setDialog(null); })}>Save due date</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        key={dialog === "cancel" ? "open" : "closed"}
        open={dialog === "cancel"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title="Cancel this loan?"
        description="Held stock is released and unpaid charges are cancelled. The member is told."
        label="Reason"
        required={false}
        confirmLabel="Cancel loan"
        pending={change.pending}
        error={change.error}
        onConfirm={(reason) => void change.run(() => cancelLoanAction(slug, { loanId, reason }), "Loan cancelled.").then((ok) => { if (ok) setDialog(null); })}
      />
    </Card>
  );
}
