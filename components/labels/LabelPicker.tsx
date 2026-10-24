"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Card, EmptyState } from "@/components/ui/display";
import { Dropdown, Field } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { labelsPerPage, MAX_LABELS, pageCount, SHEETS, type LabelSize } from "@/lib/labels/layout";

type Kind = "items" | "assets" | "locations" | "kits" | "containers";
type Option = { id: string; label: string };
export type LabelPickerRow = { id: string; code: string; name: string | null; location: string | null };

const KINDS: Array<{ value: Kind; label: string; code: string }> = [
  { value: "items", label: "Items", code: "SKU" },
  { value: "assets", label: "Assets", code: "Asset tag" },
  { value: "locations", label: "Locations", code: "Code" },
  { value: "kits", label: "Kits", code: "Kit" },
  { value: "containers", label: "Containers", code: "Code" },
];
const SIZE_LABELS: Record<LabelSize, string> = { SMALL: "Small", MEDIUM: "Medium", LARGE: "Large" };

/** Choose what to label, see how many sheets it takes, and download the PDF. */
export function LabelPicker({ slug, kind, locationId, categoryId, rows, locations, categories, defaultSize }: {
  slug: string; kind: Kind; locationId: string | null; categoryId: string | null; rows: LabelPickerRow[];
  locations: Option[]; categories: Option[]; defaultSize: LabelSize;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((row) => row.id)));
  const [size, setSize] = useState<LabelSize>(defaultSize);
  const kindInfo = KINDS.find((k) => k.value === kind)!;
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const filterByLocation = kind === "items" || kind === "assets" || kind === "locations";
  const filterByCategory = kind === "items" || kind === "assets";

  const navigate = (next: { kind?: Kind; location?: string | null; category?: string | null }) => {
    const params = new URLSearchParams({ kind: next.kind ?? kind });
    const location = next.location !== undefined ? next.location : locationId;
    const category = next.category !== undefined ? next.category : categoryId;
    if (location) params.set("location", location);
    if (category) params.set("category", category);
    router.push(`/s/${slug}/labels?${params.toString()}`);
  };

  const href = useMemo(() => {
    const params = new URLSearchParams({ kind, size });
    if (allSelected) {
      params.set("all", "1");
      if (filterByLocation && locationId) params.set("location", locationId);
      if (filterByCategory && categoryId) params.set("category", categoryId);
    } else {
      params.set("ids", rows.filter((row) => selected.has(row.id)).map((row) => row.id).join(","));
    }
    return `/s/${slug}/labels/print?${params.toString()}`;
  }, [allSelected, categoryId, filterByCategory, filterByLocation, kind, locationId, rows, selected, size, slug]);

  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const sheet = SHEETS[size];
  const sheets = pageCount(size, selected.size);

  return (
    <div className="flex flex-col gap-6">
      <Card className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Print labels for">
          <Dropdown value={kind} onChange={(event) => navigate({ kind: event.target.value as Kind, location: null, category: null })}>
            {KINDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Dropdown>
        </Field>
        {filterByLocation ? (
          <Field label="Location">
            <Dropdown value={locationId ?? ""} onChange={(event) => navigate({ location: event.target.value || null })}>
              <option value="">All locations</option>
              {locations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </Dropdown>
          </Field>
        ) : null}
        {filterByCategory ? (
          <Field label="Category">
            <Dropdown value={categoryId ?? ""} onChange={(event) => navigate({ category: event.target.value || null })}>
              <option value="">All categories</option>
              {categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </Dropdown>
          </Field>
        ) : null}
        <Field label="Label size">
          <Dropdown value={size} onChange={(event) => setSize(event.target.value as LabelSize)}>
            {(Object.keys(SHEETS) as LabelSize[]).map((value) => (
              <option key={value} value={value}>{`${SIZE_LABELS[value]}, ${SHEETS[value].width} × ${SHEETS[value].height} mm (${labelsPerPage(value)} per sheet)`}</option>
            ))}
          </Dropdown>
        </Field>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title={`No ${kindInfo.label.toLowerCase()} to label`}>Change the filters, or add some first.</EmptyState>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-body-ui text-ink-secondary" aria-live="polite">
              {selected.size} {selected.size === 1 ? "label" : "labels"} on {sheets} A4 {sheets === 1 ? "sheet" : "sheets"} of {sheet.width} × {sheet.height} mm labels.
            </p>
            {selected.size > 0 ? (
              <Button asChild variant="primary">
                <a href={href} target="_blank" rel="noopener">Download labels (PDF)</a>
              </Button>
            ) : (
              <Button variant="primary" disabled>Download labels (PDF)</Button>
            )}
          </div>
          {rows.length >= MAX_LABELS ? <p className="text-caption text-ink-muted">Showing the first {MAX_LABELS}. Narrow the filters to print the rest.</p> : null}
          <Table label={`${kindInfo.label} to label`}>
            <THead>
              <tr>
                <TH className="w-12">
                  <Checkbox aria-label="Select all" checked={allSelected ? true : selected.size > 0 ? "indeterminate" : false} onCheckedChange={(value) => setSelected(value === true ? new Set(rows.map((row) => row.id)) : new Set())} />
                </TH>
                <TH>{kindInfo.code}</TH>
                <TH>Name</TH>
                {filterByLocation ? <TH>Location</TH> : null}
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD><Checkbox aria-label={`Print ${row.code}`} checked={selected.has(row.id)} onCheckedChange={(value) => toggle(row.id, value === true)} /></TD>
                  <TD className="font-medium tabular-nums">{row.code}</TD>
                  <TD>{row.name ?? <span className="text-ink-muted">-</span>}</TD>
                  {filterByLocation ? <TD className="text-ink-muted">{row.location ?? "-"}</TD> : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
