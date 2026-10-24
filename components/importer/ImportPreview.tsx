"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyImportAction, recheckImportAction } from "@/app/actions/import";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { CheckboxField, FilterChip } from "@/components/ui/choice";
import { Callout, Card, CardHeader, Chip, EmptyState, StatTile } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { IMPORT_KIND_LABELS, type ImportKind } from "@/lib/importer/columns";

export type ImportPreviewJob = {
  id: string;
  kind: ImportKind;
  fileName: string;
  status: "PREVIEWED" | "APPLIED" | "FAILED";
  options: { createMissing: boolean; updateExisting: boolean };
  ignored: string[];
  stats: { total: number; valid: number; invalid: number; created?: number; updated?: number };
  rows: Array<{ line: number; values: Record<string, string>; errors: string[] }>;
  dateLabel: string;
};

const SHOWN: Record<ImportKind, string[]> = {
  locations: ["code", "name", "kind", "parent_code"],
  categories: ["name", "parent"],
  items: ["sku", "name", "category", "unit", "tracking", "unit_cost"],
  stock: ["sku", "location_code", "quantity", "unit_cost"],
  assets: ["sku", "location_code", "serial_number", "purchase_cost", "purchased_at"],
};
const STATUS = {
  PREVIEWED: { label: "Ready to apply", tone: "info" },
  APPLIED: { label: "Applied", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
} as const;

/** Step 2: the checked rows, their errors, the options and the apply button. */
export function ImportPreview({ slug, job, rowLimit }: { slug: string; job: ImportPreviewJob; rowLimit: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const open = job.status === "PREVIEWED";
  const rows = onlyErrors ? job.rows.filter((row) => row.errors.length > 0) : job.rows;
  const columns = SHOWN[job.kind];

  const recheck = (options: ImportPreviewJob["options"]) =>
    startTransition(async () => {
      const result = await recheckImportAction(slug, { jobId: job.id, ...options });
      if (!result.ok) showToast(result.error, "error");
      router.refresh();
    });

  const apply = () =>
    startTransition(async () => {
      const result = await applyImportAction(slug, job.id);
      setConfirming(false);
      if (!result.ok) showToast(result.error, "error");
      else showToast(`Imported: ${result.data?.created ?? 0} created, ${result.data?.updated ?? 0} updated.`, "success");
      router.refresh();
    });

  return (
    <Card className="flex flex-col gap-5">
      <CardHeader
        title={job.fileName}
        description={`${IMPORT_KIND_LABELS[job.kind]}, checked ${job.dateLabel}`}
        action={<Chip tone={STATUS[job.status].tone}>{STATUS[job.status].label}</Chip>}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Rows" value={job.stats.total} />
        <StatTile label="Ready" value={job.stats.valid} />
        <StatTile label="With errors" value={job.stats.invalid} tone={job.stats.invalid > 0 ? "attention" : "default"} hint={job.stats.invalid > 0 ? "Skipped on apply" : undefined} />
      </div>
      {job.status === "APPLIED" ? (
        <Callout tone="success" title="Import applied">
          {job.stats.created ?? 0} created and {job.stats.updated ?? 0} updated. Rows with errors were skipped.
        </Callout>
      ) : null}
      {job.status === "FAILED" ? <Callout tone="danger" title="This import stopped">Nothing was changed. Upload the file again to retry.</Callout> : null}
      {job.ignored.length > 0 ? <Callout tone="info" title="Columns ignored">{job.ignored.join(", ")} didn&apos;t match any column and were left out.</Callout> : null}

      {open && job.kind === "items" ? (
        <div className="flex flex-col gap-1">
          <CheckboxField label="Create missing categories and units" checked={job.options.createMissing} disabled={pending} onCheckedChange={(value) => recheck({ ...job.options, createMissing: value === true })} />
          <CheckboxField label="Update existing items" checked={job.options.updateExisting} disabled={pending} onCheckedChange={(value) => recheck({ ...job.options, updateExisting: value === true })} />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {open ? (
          <Button variant="primary" disabled={job.stats.valid === 0 || pending} onClick={() => setConfirming(true)}>
            Apply {job.stats.valid} {job.stats.valid === 1 ? "row" : "rows"}
          </Button>
        ) : null}
        {job.stats.invalid > 0 ? (
          <Button asChild variant="secondary">
            <a href={`/s/${slug}/import/${job.id}/errors`}>Download error report</a>
          </Button>
        ) : null}
        {job.stats.invalid > 0 ? (
          <FilterChip selected={onlyErrors} onClick={() => setOnlyErrors((value) => !value)}>Only rows with errors</FilterChip>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No rows to show">Every row in this view is ready to apply.</EmptyState>
      ) : (
        <Table label="Checked rows">
          <THead>
            <tr>
              <TH>Row</TH>
              <TH>Status</TH>
              {columns.map((column) => <TH key={column}>{column}</TH>)}
              <TH>Errors</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.line}>
                <TD className="tabular-nums text-ink-muted">{row.line}</TD>
                <TD>{row.errors.length > 0 ? <Chip tone="danger" size="sm">Error</Chip> : <Chip tone="success" size="sm">Ready</Chip>}</TD>
                {columns.map((column) => <TD key={column} className="max-w-56 truncate">{row.values[column] || <span className="text-ink-muted">-</span>}</TD>)}
                <TD className="min-w-64 text-danger-fg">{row.errors.join(" ")}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {job.stats.total > rowLimit ? (
        <p className="text-caption text-ink-muted">Showing the first {rowLimit} of {job.stats.total} rows. The error report lists every row with an error.</p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title={`Apply ${job.stats.valid} ${job.stats.valid === 1 ? "row" : "rows"}?`}
        message={job.stats.invalid > 0 ? `${job.stats.invalid} rows with errors will be skipped. Every row is checked again against the catalogue first.` : "Every row is checked again against the catalogue first."}
        confirmLabel="Apply import"
        destructive={false}
        loading={pending}
        onConfirm={apply}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
