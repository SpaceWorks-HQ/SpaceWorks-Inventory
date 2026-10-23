"use client";

import { useState } from "react";
import { cancelMyLoanAction, renewMyLoanAction } from "@/app/actions/loans";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { ReasonDialog } from "./ReasonDialog";

/** What a member can do with their own loan: renew it, or withdraw a request. */
export function MemberLoanActions({ slug, loanId, canRenew, renewHint, canCancel }: { slug: string; loanId: string; canRenew: boolean; renewHint: string; canCancel: boolean }) {
  const [cancelling, setCancelling] = useState(false);
  const renew = useActionRunner();
  const cancel = useActionRunner();
  if (!canRenew && !canCancel) return null;
  return (
    <Card as="section" aria-label="Your options">
      <CardHeader title="Your options" />
      <div className="flex flex-col gap-2">
        {renew.error ? <Callout tone="danger" role="alert">{renew.error}</Callout> : null}
        {canRenew ? (
          <>
            <Button variant="secondary" fullWidth loading={renew.pending} onClick={() => void renew.run(() => renewMyLoanAction(slug, { loanId }), "Loan renewed. Check the new due date.")}>Renew</Button>
            <p className="text-caption text-ink-muted">{renewHint}</p>
          </>
        ) : null}
        {canCancel ? <Button variant="dangerQuiet" fullWidth onClick={() => { cancel.setError(null); setCancelling(true); }}>Cancel request…</Button> : null}
      </div>
      <ReasonDialog
        key={cancelling ? "open" : "closed"}
        open={cancelling}
        onOpenChange={setCancelling}
        title="Cancel this request?"
        description="Anything held for you goes back on the shelf, and paid deposits or rental are refunded."
        label="Reason"
        required={false}
        confirmLabel="Cancel request"
        pending={cancel.pending}
        error={cancel.error}
        onConfirm={(reason) => void cancel.run(() => cancelMyLoanAction(slug, { loanId, reason }), "Request cancelled.").then((ok) => { if (ok) setCancelling(false); })}
      />
    </Card>
  );
}
