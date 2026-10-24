// Generated from app/s/[spaceSlug]/counts/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { countFormOptions, listCounts, listSchedules } from "@/lib/desk/counts";
import { COUNT_FILTER_LABEL, COUNT_FILTERS, countFilterFrom } from "@/lib/desk/countsLogic";
import { formatDayShort, formatRelativeTime } from "@/lib/format/datetime";
import { canManageCounts, requireSpace } from "@/lib/permissions";

export async function loadCountsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/counts">) {
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
const filtered = filter !== "open";
const emptyText = filtered ? "No counts match these filters." : "No counts open. Start one to check a shelf, a room or a category.";
return viewDto({ manager, slug, rows, tabs, schedules, locations, categories, filtered, emptyText } as const);
}
