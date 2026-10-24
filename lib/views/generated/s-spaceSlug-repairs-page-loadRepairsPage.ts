// Generated from app/s/[spaceSlug]/repairs/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";
import { listRepairs, repairFilter, repairViewer, REPAIR_FILTERS } from "@/lib/repairs";
import { canReportRepairs } from "@/lib/roles";

export async function loadRepairsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/repairs">) {
const { spaceSlug } = await params;
const query = await searchParams;
const { space, user, membership } = await requireSpace(spaceSlug, "TECHNICIAN");
const viewer = await repairViewer(space.id, user, membership);
const filter = repairFilter(query.status);
const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
const { rows, counts } = await listRepairs({ id: space.id, timezone: space.timezone }, viewer, filter, q);
const base = `/s/${space.slug}/repairs`;
const tabs = REPAIR_FILTERS.map((entry) => ({ href: entry.key === "open" ? base : `${base}?status=${entry.key}`, label: `${entry.label} (${counts[entry.key] ?? 0})`, active: entry.key === filter.key }));
const canReport = canReportRepairs(membership);
const currency = space.currency;
const description = viewer.viewAll
    ? "Damaged and broken items and assets, from report to verified fix. Send each one to the technicians who can fix it."
    : viewer.technicianId ? "The repairs you were asked to take, and the ones you are working on." : "Problems you reported and how they are going.";
return viewDto({ viewer, filter, rows, base, tabs, canReport, currency, description } as const);
}
