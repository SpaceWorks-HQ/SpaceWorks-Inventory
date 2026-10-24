// Generated from app/s/[spaceSlug]/transfers/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { transferRef } from "@/lib/catalogue/references";
import { DIRECTION_LABEL, FILTER_LABEL } from "@/lib/desk/transferLogic";
import { listTransfers } from "@/lib/desk/transfers";
import { TRANSFER_DIRECTIONS, TRANSFER_FILTERS, type TransferDirection, type TransferFilter } from "@/lib/desk/transferSchemas";
import { formatDayShort, formatRelativeTime } from "@/lib/format/datetime";
import { canRequestTransfers, requireSpace } from "@/lib/permissions";
const SIDE_WORD = { source: "Outgoing", destination: "Incoming", both: "Between locations" } as const;
function listHref(slug: string, direction: TransferDirection, filter: TransferFilter) {
  const params = new URLSearchParams();
  if (direction !== "all") params.set("dir", direction);
  if (filter !== "open") params.set("status", filter);
  const query = params.toString();
  return `/s/${slug}/transfers${query ? `?${query}` : ""}`;
}
export async function loadTransfersPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/transfers">) {
const { spaceSlug } = await params;
const { space, membership } = await requireSpace(spaceSlug, "STAFF");
const query = await searchParams;
const direction = TRANSFER_DIRECTIONS.find((value) => value === query.dir) ?? "all";
const filter = TRANSFER_FILTERS.find((value) => value === query.status) ?? "open";
const slug = space.slug;
const canRequest = canRequestTransfers(membership);
const transfers = await listTransfers(space.id, { direction, filter });
const rows = transfers.map((row) => ({
    id: row.id,
    reference: transferRef(row.number),
    status: row.status,
    counterpart: row.counterpart,
    directionLabel: SIDE_WORD[row.side],
    units: row.units,
    lineCount: row.lineCount,
    dateLabel: row.expectedAt ? `Due ${formatDayShort(row.expectedAt, space.timezone)}` : row.neededBy ? `Needed ${formatDayShort(row.neededBy, space.timezone)}` : "No date",
    createdLabel: formatRelativeTime(row.createdAt, space.timezone),
  }));
const tabs = TRANSFER_FILTERS.map((value) => ({ href: listHref(slug, direction, value), label: FILTER_LABEL[value], active: value === filter }));
const directions = TRANSFER_DIRECTIONS.map((value) => ({ href: listHref(slug, value, filter), label: DIRECTION_LABEL[value], active: value === direction }));
const filtered = filter !== "open" || direction !== "all";
const emptyText = filtered ? "No transfers match these filters." : "No transfers on the move. Raise one to move stock between shelves or spaces.";
return viewDto({ slug, canRequest, rows, tabs, directions, filtered, emptyText } as const);
}
