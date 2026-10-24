import Link from "next/link";
import { Card, CardHeader, Chip, EmptyState } from "@/components/ui/display";
import { IMPORT_KIND_LABELS, isImportKind } from "@/lib/importer/columns";

export type ImportJobRow = {
  id: string;
  kind: string;
  fileName: string;
  status: "PREVIEWED" | "APPLIED" | "FAILED";
  stats: { total: number; valid: number; invalid: number; created?: number; updated?: number };
  dateLabel: string;
};

const STATUS = {
  PREVIEWED: { label: "Not applied", tone: "warning" },
  APPLIED: { label: "Applied", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
} as const;

function summary(job: ImportJobRow) {
  if (job.status === "APPLIED") return `${job.stats.created ?? 0} created, ${job.stats.updated ?? 0} updated, ${job.stats.invalid} skipped`;
  return `${job.stats.total} rows, ${job.stats.invalid} with errors`;
}

/** The latest imports of the space, newest first. */
export function ImportJobsList({ slug, jobs, currentId }: { slug: string; jobs: ImportJobRow[]; currentId: string | null }) {
  return (
    <Card>
      <CardHeader title="Recent imports" titleAs="h2" />
      {jobs.length === 0 ? (
        <EmptyState className="mt-4" title="No imports yet">Files you check appear here, applied or not.</EmptyState>
      ) : (
        <ul className="mt-3 flex flex-col divide-y divide-line">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/s/${slug}/import?job=${encodeURIComponent(job.id)}`}
                aria-current={job.id === currentId ? "true" : undefined}
                className="flex min-h-11 flex-col gap-1 rounded-md px-2 py-3 transition-colors hover:bg-subtle aria-[current]:bg-subtle"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-title text-ink">{job.fileName}</span>
                  <Chip tone={STATUS[job.status].tone} size="sm">{STATUS[job.status].label}</Chip>
                </span>
                <span className="text-caption text-ink-muted">
                  {isImportKind(job.kind) ? IMPORT_KIND_LABELS[job.kind] : job.kind} · {summary(job)} · {job.dateLabel}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
