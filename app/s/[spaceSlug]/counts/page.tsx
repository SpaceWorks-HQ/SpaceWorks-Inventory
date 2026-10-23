import Link from "next/link";
import { Plus } from "lucide-react";
import { CountsTable } from "@/components/counts/CountsTable";
import { SchedulesCard } from "@/components/counts/SchedulesCard";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
import { countFormOptions, listCounts, listSchedules } from "@/lib/desk/counts";
import { COUNT_FILTER_LABEL, COUNT_FILTERS, countFilterFrom } from "@/lib/desk/countsLogic";
import { formatDayShort, formatRelativeTime } from "@/lib/format/datetime";
import { canManageCounts, requireSpace } from "@/lib/permissions";

export default async function CountsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/counts">) {
  const { spaceSlug } = await params;
  const { space, membership } = await requireSpace(spaceSlug, "STAFF");
  const query = await searchParams;
  const filter = countFilterFrom(query.status);
  const manager = canManageCounts(membership);
  const slug = space.slug;
  const counts = await listCounts(space.id, filter);
  const rows = counts.map((count) => ({ id: count.id, reference: count.reference, name: count.name, status: count.status, blind: count.blind, scope: count.scope, lines: count.lines, counted: count.counted, scans: count.scans, updatedLabel: formatRelativeTime(count.updatedAt, space.timezone) }));
  const tabs = COUNT_FILTERS.map((value) => ({ href: `/s/${slug}/counts${value === "open" ? "" : `?status=${value}`}`, label: COUNT_FILTER_LABEL[value], active: value === filter }));
  const schedules = manager ? (await listSchedules(space.id)).map((schedule) => ({ id: schedule.id, name: schedule.name, scope: schedule.scope, everyDays: schedule.everyDays, blind: schedule.blind, active: schedule.active, nextRunLabel: formatDayShort(schedule.nextRunAt, space.timezone) })) : [];
  const options = manager ? await countFormOptions(space.id) : { locations: [], categories: [], items: [] };
  const locations = options.locations;
  const categories = options.categories;
  const emptyText = filter === "open" ? "No counts open. Start one to check a shelf, a room or a category." : `No ${COUNT_FILTER_LABEL[filter].toLowerCase()} counts.`;

  return (
    <ListLayout
      header={
        <PageHeader
          title="Cycle counts"
          description="Count what is really on the shelves, then post the differences to stock."
          actions={manager ? <Link href={`/s/${slug}/counts/new`} className={buttonClasses({ variant: "primary" })}><Plus aria-hidden className="size-5" />New count</Link> : undefined}
        />
      }
      toolbar={<NavTabs label="Count status" items={tabs} />}
    >
      {rows.length ? <CountsTable slug={slug} rows={rows} /> : (
        <EmptyState patch={filter === "open" ? true : undefined} action={manager && filter === "open" ? <Link href={`/s/${slug}/counts/new`} className={buttonClasses({ variant: "secondary" })}>Start a count</Link> : undefined}>
          {emptyText}
        </EmptyState>
      )}
      {manager ? <SchedulesCard slug={slug} schedules={schedules} locations={locations} categories={categories} /> : null}
    </ListLayout>
  );
}
