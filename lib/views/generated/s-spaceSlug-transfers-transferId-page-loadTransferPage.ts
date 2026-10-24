// Generated from app/s/[spaceSlug]/transfers/[transferId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { transferRef } from "@/lib/catalogue/references";
import { locationOptions } from "@/lib/desk/locations";
import { allowedTransferActions } from "@/lib/desk/transferLogic";
import { pickableAssets, transferDetail } from "@/lib/desk/transfers";
import { formatDayShort, formatDayTime, formatRelativeTime } from "@/lib/format/datetime";
import { findSpaceForUser, requireSpace } from "@/lib/permissions";
import { doneFor } from "@/lib/desk/stepper";
const SIDE_WORD = { source: "Sending", destination: "Receiving", both: "Sending and receiving" } as const;
export async function loadTransferPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/transfers/[transferId]">) {
const { spaceSlug, transferId } = await params;
const query = await searchParams;
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
const done = doneFor(query.done, ["dispatch", "receive", "receive-return"], status);
const transferIdValue = transfer.id;
const destLocationId = transfer.destLocationId;
const sourceLocationId = transfer.sourceLocationId;
return viewDto({ transfer, slug, allowed, lines, locations, pickable, minPhotos, otherHref, otherName, reference, facts, notice, timeline, evidence, status, done, transferIdValue, destLocationId, sourceLocationId } as const);
}
