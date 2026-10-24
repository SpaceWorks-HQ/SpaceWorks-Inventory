"use client";

import { useState } from "react";
import { approveLoanAction, cancelLoanAction, rejectLoanAction } from "@/app/actions/loans";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ReasonDialog } from "./ReasonDialog";

export type ApproveLine = { id: string; name: string; sku: string; requested: number; available: number };

/** A request waiting at the desk: approve some or all units, or refuse it with a reason. */
export function ApproveCard({ slug, loanId, lines, eligibility }: { slug: string; loanId: string; lines: ApproveLine[]; eligibility: string | null }) {
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, Math.min(line.requested, Math.max(0, line.available))])));
  const [dialog, setDialog] = useState<"reject" | "cancel" | null>(null);
  const { run, pending, error, setError } = useActionRunner();
  const dialogRunner = useActionRunner();
  const total = Object.values(quantities).reduce((sum, n) => sum + n, 0);

  return (
    <Card as="section" aria-label="Approve the request">
      <CardHeader title="Approve the request" description="Approving holds the stock until it is handed over. Lower a quantity to approve part of it." />
      <div className="flex flex-col gap-4">
        {eligibility ? <Callout tone="warning" title="The member can't borrow right now">{eligibility}</Callout> : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Table label="Requested items">
          <THead><TR><TH>Item</TH><TH className="text-right">Requested</TH><TH className="text-right">Available</TH><TH className="text-right">Approve</TH></TR></THead>
          <TBody>
            {lines.map((line) => (
              <TR key={line.id}>
                <TD><span className="block text-ink">{line.name}</span><span className="block text-caption text-ink-muted">{line.sku}</span></TD>
                <TD className="text-right">{line.requested}</TD>
                <TD className="text-right">{line.available}</TD>
                <TD className="text-right">
                  <QuantityInput label={`Approve units of ${line.name}`} value={quantities[line.id] ?? 0} max={line.requested} onChange={(value) => setQuantities((q) => ({ ...q, [line.id]: value }))} className="ml-auto" />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="dangerQuiet" onClick={() => { dialogRunner.setError(null); setDialog("cancel"); }}>Cancel request…</Button>
          <Button variant="danger" onClick={() => { dialogRunner.setError(null); setDialog("reject"); }}>Reject…</Button>
          <Button variant="primary" loading={pending} disabled={total === 0} onClick={() => { setError(null); void run(() => approveLoanAction(slug, { loanId, quantities }), "Request approved. It's ready to collect."); }}>
            {total === 0 ? "Approve" : `Approve ${total} ${total === 1 ? "unit" : "units"}`}
          </Button>
        </div>
      </div>
      <ReasonDialog
        key={dialog ?? "closed"}
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        title={dialog === "reject" ? "Reject this request?" : "Cancel this request?"}
        description={dialog === "reject" ? "The member sees your reason." : "Any held stock is released."}
        label="Reason"
        required={dialog === "reject"}
        confirmLabel={dialog === "reject" ? "Reject request" : "Cancel request"}
        pending={dialogRunner.pending}
        error={dialogRunner.error}
        onConfirm={(reason) => {
          const work = dialog === "reject" ? () => rejectLoanAction(slug, { loanId, reason }) : () => cancelLoanAction(slug, { loanId, reason });
          void dialogRunner.run(work, dialog === "reject" ? "Request rejected." : "Request cancelled.").then((ok) => { if (ok) setDialog(null); });
        }}
      />
    </Card>
  );
}
