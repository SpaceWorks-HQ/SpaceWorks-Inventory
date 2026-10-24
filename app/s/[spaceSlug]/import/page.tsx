import { ImportJobsList } from "@/components/importer/ImportJobsList";
import { ImportPreview } from "@/components/importer/ImportPreview";
import { ImportUploader } from "@/components/importer/ImportUploader";
import { SampleDataCard } from "@/components/importer/SampleDataCard";
import { PageHeader } from "@/components/ui/display";
import { formatDayTime } from "@/lib/format/datetime";
import { importJobView, listImportJobs, PREVIEW_ROW_LIMIT } from "@/lib/importer";
import { requireSpace } from "@/lib/permissions";
import { canLoadSampleData } from "@/lib/sampleData";

export default async function ImportPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/import">) {
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

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <PageHeader title="Import" description="Bring locations, categories, items, stock and assets in from a spreadsheet. Check the rows first, then apply." />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          {job ? <ImportPreview key={`${job.id}:${job.status}`} slug={slug} job={job} rowLimit={rowLimit} /> : null}
          <ImportUploader slug={slug} currency={currency} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {offerSampleData ? <SampleDataCard slug={slug} /> : null}
          <ImportJobsList slug={slug} jobs={jobs} currentId={job?.id ?? null} />
        </div>
      </div>
    </div>
  );
}
