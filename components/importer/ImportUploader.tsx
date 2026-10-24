"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewImportAction } from "@/app/actions/import";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Card, CardHeader } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { IMPORT_COLUMNS, IMPORT_KIND_LABELS, IMPORT_KINDS, type ImportKind } from "@/lib/importer/columns";

const HINTS: Record<ImportKind, string> = {
  locations: "List parents above the locations inside them, or point at codes that already exist.",
  categories: "List a parent category above its sub-categories, or name one that already exists.",
  items: "Leave SKU empty to have one made from the name. Money is in major units, like 1250.50.",
  stock: "Adds stock to quantity items at each location. Every row is a receipt in the stock ledger.",
  assets: "One row per physical unit of a serialized item. Each gets its own asset tag and QR code.",
};

/** Step 1 of an import: choose what the file holds, pick it, and check every row. */
export function ImportUploader({ slug, currency }: { slug: string; currency: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<ImportKind>("items");
  const [createMissing, setCreateMissing] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const columns = IMPORT_COLUMNS[kind];

  const submit = () => {
    if (!file) {
      setError("Choose a CSV or XLSX file.");
      return;
    }
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    form.set("createMissing", String(createMissing));
    form.set("updateExisting", String(updateExisting));
    startTransition(async () => {
      const result = await previewImportAction(slug, form);
      if (!result.ok) {
        setError(result.fieldErrors?.file?.[0] ?? result.error);
        return;
      }
      setError(undefined);
      router.push(`/s/${slug}/import?job=${encodeURIComponent(result.data!.jobId)}`);
    });
  };

  return (
    <Card>
      <CardHeader title="Upload a file" description={`CSV or XLSX, up to 5 MB and 5,000 rows. Amounts are in ${currency}.`} />
      <form
        className="mt-5 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What the file holds">
            <Dropdown value={kind} onChange={(event) => setKind(event.target.value as ImportKind)}>
              {IMPORT_KINDS.map((value) => (
                <option key={value} value={value}>{IMPORT_KIND_LABELS[value]}</option>
              ))}
            </Dropdown>
          </Field>
          <Field label="File" error={error}>
            <Input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(undefined);
              }}
            />
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="text-label text-ink">Columns</p>
          <p className="mt-1 text-body-ui text-ink-secondary">
            {columns.map((column) => (column.required ? `${column.key} (required)` : column.key)).join(", ")}
          </p>
          <p className="mt-2 text-caption text-ink-muted">{HINTS[kind]}</p>
        </div>

        {kind === "items" ? (
          <div className="flex flex-col gap-1">
            <CheckboxField
              label="Create missing categories and units"
              description="Names the file uses that don't exist yet are created on apply."
              checked={createMissing}
              onCheckedChange={(value) => setCreateMissing(value === true)}
            />
            <CheckboxField
              label="Update existing items"
              description="Rows whose SKU already exists change that item. Empty cells keep the current value."
              checked={updateExisting}
              onCheckedChange={(value) => setUpdateExisting(value === true)}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" variant="primary" loading={pending} loadingLabel="Checking rows">
            Check file
          </Button>
          <Button asChild variant="secondary">
            <a href={`/samples/${kind}.csv`} download={`${kind}-template.csv`}>Download template</a>
          </Button>
        </div>
      </form>
    </Card>
  );
}
