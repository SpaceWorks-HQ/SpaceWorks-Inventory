import Link from "next/link";
import { Plus } from "lucide-react";
import { DirectionLinks } from "@/components/transfers/DirectionLinks";
import { TransfersTable } from "@/components/transfers/TransfersTable";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
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

export default async function TransfersPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/transfers">) {
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

  return (
    <ListLayout
      header={
        <PageHeader
          title="Transfers"
          description="Move stock between your shelves, or between spaces of this install."
          actions={canRequest ? <Link href={`/s/${slug}/transfers/new`} className={buttonClasses({ variant: "primary" })}><Plus aria-hidden className="size-5" />New transfer</Link> : undefined}
        />
      }
      toolbar={<div className="flex flex-col gap-3"><NavTabs label="Transfer status" items={tabs} /><DirectionLinks label="Direction" items={directions} /></div>}
    >
      {rows.length ? <TransfersTable slug={slug} rows={rows} /> : (
        <EmptyState patch={!filtered ? true : undefined} action={filtered ? <Link href={`/s/${slug}/transfers`} className={buttonClasses({ variant: "secondary" })}>Clear filters</Link> : canRequest ? <Link href={`/s/${slug}/transfers/new`} className={buttonClasses({ variant: "secondary" })}>Raise a transfer</Link> : undefined}>
          {emptyText}
        </EmptyState>
      )}
    </ListLayout>
  );
}
