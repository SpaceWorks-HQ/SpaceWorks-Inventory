"use client";

import { useState } from "react";
import { approveTransferAction, rejectTransferAction } from "@/app/actions/transfers";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { StepDialog } from "./StepDialog";
import { TRANSFER_REASON_MAX } from "@/lib/desk/transferSchemas";
import type { TransferLineView } from "./types";

/** The sending space's manager approves some or all of each line (stock is held at the source), or rejects. */
export function ApproveCard({ slug, transferId, lines }: { slug: string; transferId: string; lines: TransferLineView[] }) {
  const approve = useActionRunner();
  const reject = useActionRunner();
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(lines.map((line) => [line.id, line.requested])));
  const total = Object.values(quantities).reduce((sum, value) => sum + value, 0);

  return (
    <Card as="section" aria-label="Approve">
      <CardHeader title="Approve this transfer" description="Approve fewer units if not everything can go. Approved stock is held at the source shelf until dispatch." />
      <ul className="mb-4 divide-y divide-line rounded-lg border border-line">
        {lines.map((line) => (
          <li key={line.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0">
              <span className="block text-body-ui text-ink">{line.itemName}</span>
              <span className="block text-caption text-ink-muted">{line.sku} · {line.requested} requested</span>
            </span>
            <QuantityInput label={`Approve how many ${line.itemName}`} value={quantities[line.id] ?? 0} max={line.requested} onChange={(value) => setQuantities((current) => ({ ...current, [line.id]: value }))} />
          </li>
        ))}
      </ul>
      {approve.error ? <Callout tone="danger" role="alert" className="mb-4">{approve.error}</Callout> : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" loading={approve.pending} disabled={total === 0} onClick={() => void approve.run(() => approveTransferAction(slug, { transferId, quantities }), "Transfer approved. Stock is held for picking.")}>
          Approve {total} {total === 1 ? "unit" : "units"}
        </Button>
        <StepDialog
          trigger="Reject…"
          triggerVariant="danger"
          title="Reject this transfer?"
          description="The requesting side sees your reason."
          textLabel="Reason"
          maxLength={TRANSFER_REASON_MAX}
          textRequired
          confirmLabel="Reject transfer"
          destructive
          pending={reject.pending}
          error={reject.error}
          onConfirm={(reason) => reject.run(() => rejectTransferAction(slug, { transferId, reason }), "Transfer rejected.")}
        />
      </div>
    </Card>
  );
}
