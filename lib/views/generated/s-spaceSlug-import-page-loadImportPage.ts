// Generated from app/s/[spaceSlug]/import/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { formatDayTime } from "@/lib/format/datetime";
import { importJobView, listImportJobs, PREVIEW_ROW_LIMIT } from "@/lib/importer";
import { requireSpace } from "@/lib/permissions";
import { canLoadSampleData } from "@/lib/sampleData";

export async function loadImportPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/import">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const { job: jobParam } = await searchParams;
const jobId = typeof jobParam === "string" ? jobParam : null;
const view = jobId ? await importJobView(space.id, jobId) : null;
const job = view ? { id: view.id, kind: view.kind, fileName: view.fileName, status: view.status, options: view.options, ignored: view.ignored, stats: view.stats, rows: view.rows, dateLabel: formatDayTime(view.createdAt, space.timezone) } : null;
const jobs = (await listImportJobs(space.id, 10)).map((row) => ({ id: row.id, kind: row.kind, fileName: row.fileName, status: row.status, stats: row.stats, dateLabel: formatDayTime(row.createdAt, space.timezone) }));
const offerSampleData = await canLoadSampleData(space.id);
const slug = space.slug;
const currency = space.currency;
const rowLimit = PREVIEW_ROW_LIMIT;
return viewDto({ job, jobs, offerSampleData, slug, currency, rowLimit } as const);
}
