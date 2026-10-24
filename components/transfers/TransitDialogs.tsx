"use client";

import { useState } from "react";
import { cancelTransferAction, declareMissingAction, sendBackAction } from "@/app/actions/transfers";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { CheckboxField } from "@/components/ui/choice";
import { StepDialog } from "./StepDialog";
import { TRANSFER_NOTE_MAX, TRANSFER_REASON_MAX } from "@/lib/desk/transferSchemas";
import type { TransferLineView } from "./types";

type Base = { slug: string; transferId: string };

/** Units still on the way: a quantity per quantity line, a tick per serialized unit. */
function InTransitPicker({ lines, quantities, setQuantities, assetIds, setAssetIds, verb }: {
  lines: TransferLineView[]; quantities: Record<string, number>; setQuantities: (next: Record<string, number>) => void; assetIds: string[]; setAssetIds: (next: string[]) => void; verb: string;
}) {
  const open = lines.filter((line) => line.inTransit > 0);
  return (
    <ul className="divide-y divide-line rounded-lg border border-line">
      {open.map((line) => (
        <li key={line.id} className="flex flex-col gap-1 px-4 py-2">
          <span className="text-body-ui text-ink">{line.itemName} <span className="text-ink-muted">{line.inTransit} in transit</span></span>
          {line.tracking === "QUANTITY" ? (
            <QuantityInput label={`${verb} ${line.itemName}`} value={quantities[line.id] ?? 0} max={line.inTransit} onChange={(value) => setQuantities({ ...quantities, [line.id]: value })} />
          ) : (
            line.assets.filter((asset) => asset.state === "DISPATCHED").map((asset) => (
              <CheckboxField key={asset.id} label={asset.tag} checked={assetIds.includes(asset.id)} onCheckedChange={(on) => setAssetIds(on === true ? [...assetIds, asset.id] : assetIds.filter((id) => id !== asset.id))} />
            ))
          )}
        </li>
      ))}
    </ul>
  );
}

const toLines = <K extends string>(quantities: Record<string, number>, key: K) => Object.entries(quantities).filter(([, value]) => value > 0).map(([lineId, value]) => ({ lineId, [key]: value }) as { lineId: string } & Record<K, number>);

/** Either side closes a discrepancy: units that won't arrive are written off as missing (lost tools become lost). */
export function MissingDialog({ slug, transferId, lines }: Base & { lines: TransferLineView[] }) {
  const runner = useActionRunner();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [assetIds, setAssetIds] = useState<string[]>([]);
  return (
    <StepDialog
      trigger="Declare missing…" triggerVariant="danger" title="Declare units missing?" destructive
      description="Missing units leave the sending space's stock for good. Use this only when they won't turn up."
      textLabel="What happened" textRequired maxLength={TRANSFER_NOTE_MAX} confirmLabel="Declare missing" pending={runner.pending} error={runner.error}
      onConfirm={(note) => runner.run(() => declareMissingAction(slug, { transferId, lines: toLines(quantities, "missing"), missingAssetIds: assetIds, note }), "Missing units recorded.")}
    >
      <InTransitPicker lines={lines} quantities={quantities} setQuantities={setQuantities} assetIds={assetIds} setAssetIds={setAssetIds} verb="Missing" />
    </StepDialog>
  );
}

/** The receiving side refuses units still in transit; they travel back to the sender. */
export function SendBackDialog({ slug, transferId, lines }: Base & { lines: TransferLineView[] }) {
  const runner = useActionRunner();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [assetIds, setAssetIds] = useState<string[]>([]);
  return (
    <StepDialog
      trigger="Send back…" title="Send units back to the sender?"
      description="They stay out of both spaces' stock until the sender receives them."
      textLabel="Reason" textRequired maxLength={TRANSFER_REASON_MAX} confirmLabel="Send back" pending={runner.pending} error={runner.error}
      onConfirm={(reason) => runner.run(() => sendBackAction(slug, { transferId, lines: toLines(quantities, "quantity"), assetIds, reason }), "Units are on their way back.")}
    >
      <InTransitPicker lines={lines} quantities={quantities} setQuantities={setQuantities} assetIds={assetIds} setAssetIds={setAssetIds} verb="Send back" />
    </StepDialog>
  );
}

/** Before dispatch either side may cancel; held stock is released. */
export function CancelTransferDialog({ slug, transferId }: Base) {
  const runner = useActionRunner();
  return (
    <StepDialog
      trigger="Cancel transfer…" triggerVariant="danger" title="Cancel this transfer?" destructive
      description="Any held stock is released. This can't be undone."
      textLabel="Reason" maxLength={TRANSFER_REASON_MAX} confirmLabel="Cancel transfer" pending={runner.pending} error={runner.error}
      onConfirm={(reason) => runner.run(() => cancelTransferAction(slug, { transferId, reason }), "Transfer cancelled.")}
    />
  );
}
