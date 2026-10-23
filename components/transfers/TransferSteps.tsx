import type { TransferAction } from "@/lib/transfers/policy";
import type { LocationOption } from "@/components/desk/LocationPicker";
import { Card, CardHeader } from "@/components/ui/display";
import { ApproveCard } from "./ApproveCard";
import { DispatchFlow } from "./DispatchFlow";
import { ReceiveFlow } from "./ReceiveFlow";
import { ReceiveReturnFlow } from "./ReceiveReturnFlow";
import { CancelTransferDialog, MissingDialog, SendBackDialog } from "./TransitDialogs";
import type { PickableAsset, TransferLineView } from "./types";

type Props = {
  slug: string;
  transferId: string;
  allowed: TransferAction[];
  lines: TransferLineView[];
  locations: LocationOption[];
  pickable: PickableAsset[];
  minPhotos: number;
  destLocationId: string | null;
  sourceLocationId: string | null;
};

/** The steps this side may take now: the main flow first, the rarer steps in a quiet card below. */
export function TransferSteps({ slug, transferId, allowed, lines, locations, pickable, minPhotos, destLocationId, sourceLocationId }: Props) {
  const can = (action: TransferAction) => allowed.includes(action);
  // Remount the forms after every step so their defaults follow the new quantities.
  const version = lines.map((line) => [line.approved, line.dispatched, line.received, line.damaged, line.missing, line.returning, line.returned].join(".")).join("|");
  const extras = can("sendBack") || can("missing") || can("cancel");
  return (
    <div className="flex flex-col gap-6">
      {can("approve") ? <ApproveCard key={version} slug={slug} transferId={transferId} lines={lines} /> : null}
      {can("dispatch") ? <DispatchFlow key={version} slug={slug} transferId={transferId} lines={lines} assets={pickable} minPhotos={minPhotos} /> : null}
      {can("receive") && lines.some((line) => line.inTransit > 0) ? <ReceiveFlow key={version} slug={slug} transferId={transferId} lines={lines} locations={locations} defaultLocationId={destLocationId} minPhotos={minPhotos} /> : null}
      {can("receiveReturn") && lines.some((line) => line.comingBack > 0) ? <ReceiveReturnFlow key={version} slug={slug} transferId={transferId} lines={lines} locations={locations} defaultLocationId={sourceLocationId} minPhotos={minPhotos} /> : null}
      {extras ? (
        <Card as="section" aria-label="Other steps">
          <CardHeader title="Something not right?" description="Send refused units back, write off units that won't arrive, or cancel before dispatch." />
          <div className="flex flex-wrap gap-2">
            {can("sendBack") && lines.some((line) => line.inTransit > 0) ? <SendBackDialog key={version} slug={slug} transferId={transferId} lines={lines} /> : null}
            {can("missing") && lines.some((line) => line.inTransit > 0) ? <MissingDialog key={version} slug={slug} transferId={transferId} lines={lines} /> : null}
            {can("cancel") ? <CancelTransferDialog slug={slug} transferId={transferId} /> : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
