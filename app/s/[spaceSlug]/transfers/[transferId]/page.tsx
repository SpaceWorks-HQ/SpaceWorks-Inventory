import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceGallery } from "@/components/desk/EvidenceGallery";
import { Timeline } from "@/components/desk/Timeline";
import { TransferStatusChip } from "@/components/inventory/StatusChips";
import { TransferLinesTable } from "@/components/transfers/TransferLinesTable";
import { TransferSteps } from "@/components/transfers/TransferSteps";
import { Callout, Card, CardHeader, DetailList, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { transferRef } from "@/lib/catalogue/references";
import { locationOptions } from "@/lib/desk/locations";
import { allowedTransferActions } from "@/lib/desk/transferLogic";
import { pickableAssets, transferDetail } from "@/lib/desk/transfers";
import { formatDayShort, formatDayTime, formatRelativeTime } from "@/lib/format/datetime";
import { findSpaceForUser, requireSpace } from "@/lib/permissions";

const SIDE_WORD = { source: "Sending", destination: "Receiving", both: "Sending and receiving" } as const;

export default async function TransferPage({ params }: PageProps<"/s/[spaceSlug]/transfers/[transferId]">) {
  const { spaceSlug, transferId } = await params;
  const { space, membership, user } = await requireSpace(spaceSlug, "STAFF");
  const transfer = await transferDetail(space.slug, space.id, transferId);
  if (!transfer) notFound();
  const slug = space.slug;
  const tz = space.timezone;
  const allowed = allowedTransferActions(transfer.status, transfer.side, membership.role);
  const lines = transfer.lines;
  const locations = allowed.some((action) => action === "receive" || action === "receiveReturn") ? await locationOptions(space.id) : [];
  const pickable = allowed.includes("dispatch")
    ? (await pickableAssets(space.id, lines.filter((line) => line.tracking === "SERIALIZED" && line.approved > 0).map((line) => line.itemId))).map((asset) => ({ id: asset.id, itemId: asset.itemId, tag: asset.assetTag, code: asset.qrCode, itemName: asset.item.name }))
    : [];
  const minPhotos = transfer.side === "destination" ? transfer.dest.minPhotos : transfer.source.minPhotos;
  const otherSlug = transfer.side === "source" ? transfer.dest.slug : transfer.side === "destination" ? transfer.source.slug : null;
  const otherAccess = otherSlug ? await findSpaceForUser(otherSlug, user.id) : null;
  const otherHref = otherSlug && otherAccess ? `/s/${otherSlug}/transfers/${transfer.id}` : null;
  const otherName = transfer.side === "source" ? transfer.dest.name : transfer.source.name;
  const reference = transferRef(transfer.number);
  const facts = [
    { label: "Your side", value: SIDE_WORD[transfer.side] },
    { label: "From", value: transfer.betweenSpaces ? `${transfer.source.name}${transfer.sourceLocation ? ` · ${transfer.sourceLocation}` : ""}` : transfer.sourceLocation ?? "Unknown shelf" },
    { label: "To", value: transfer.betweenSpaces ? `${transfer.dest.name}${transfer.destLocation ? ` · ${transfer.destLocation}` : ""}` : transfer.destLocation ?? "Chosen on arrival" },
    { label: "Raised by", value: `${transfer.requestedBy} (${transfer.initiatedBy})` },
    ...(transfer.reason ? [{ label: "Reason", value: transfer.reason }] : []),
    ...(transfer.neededBy ? [{ label: "Needed by", value: formatDayShort(transfer.neededBy, tz) }] : []),
    ...(transfer.carrier || transfer.trackingRef ? [{ label: "Carrier", value: [transfer.carrier, transfer.trackingRef].filter(Boolean).join(" · ") }] : []),
    ...(transfer.expectedAt ? [{ label: "Expected", value: formatDayShort(transfer.expectedAt, tz) }] : []),
  ];
  const notice = transfer.status === "REJECTED" ? `Rejected: ${transfer.rejectionReason ?? "no reason given"}`
    : transfer.status === "CANCELLED" ? `Cancelled${transfer.cancelReason ? `: ${transfer.cancelReason}` : "."}`
    : transfer.status === "RETURNING" || transfer.status === "RETURNED" ? `Sent back${transfer.returnReason ? `: ${transfer.returnReason}` : "."}`
    : allowed.length === 0 && (transfer.status === "REQUESTED" || transfer.status === "APPROVED") ? (transfer.side === "destination" ? `Waiting for ${transfer.source.name} to ${transfer.status === "REQUESTED" ? "approve" : "pick and dispatch"} it.` : transfer.status === "REQUESTED" ? "Waiting for an inventory manager to approve it." : null)
    : null;
  const timeline = transfer.events.map((event) => ({ id: event.id, title: event.title, detail: event.detail, actorName: transfer.betweenSpaces ? `${event.actorName}, ${event.spaceName}` : event.actorName, whenLabel: formatRelativeTime(event.createdAt, tz) }));
  const evidence = transfer.evidence.map((item) => ({ id: item.id, kindLabel: item.kindLabel, remarks: item.remarks, scannedCount: item.scannedCount, actorName: item.actorName, whenLabel: formatDayTime(item.createdAt, tz), photos: item.photos }));
  const status = transfer.status;
  const transferIdValue = transfer.id;
  const destLocationId = transfer.destLocationId;
  const sourceLocationId = transfer.sourceLocationId;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/transfers`, label: "Back to transfers" }}
      header={<PageHeader kicker={<span className="inline-flex items-center gap-2">Transfer <TransferStatusChip status={status} /></span>} title={reference} description={transfer.betweenSpaces ? `${transfer.source.name} to ${transfer.dest.name}` : "Between shelves of this space"} />}
      aside={
        <div className="flex flex-col gap-4">
          <Card as="section" aria-label="Details">
            <CardHeader title="Details" />
            <DetailList items={facts} />
          </Card>
          {otherHref ? <Link href={otherHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">Open as {otherName}</Link> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        {notice ? <Callout tone={status === "REJECTED" || status === "CANCELLED" ? "warning" : "info"}>{notice}</Callout> : null}
        <TransferSteps slug={slug} transferId={transferIdValue} allowed={allowed} lines={lines} locations={locations} pickable={pickable} minPhotos={minPhotos} destLocationId={destLocationId} sourceLocationId={sourceLocationId} />
        <TransferLinesTable lines={lines} />
        <Timeline entries={timeline} />
        <EvidenceGallery items={evidence} />
      </div>
    </DetailLayout>
  );
}
