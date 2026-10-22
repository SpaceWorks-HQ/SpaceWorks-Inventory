import { LabelPicker } from "@/components/labels/LabelPicker";
import { PageHeader } from "@/components/ui/display";
import { findLabelRows, LABEL_KINDS, labelFilterOptions } from "@/lib/labels";
import { requireSpace } from "@/lib/permissions";

export default async function LabelsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/labels">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const query = await searchParams;
  const kind = LABEL_KINDS.find((value) => value === query.kind) ?? "items";
  const filters = await labelFilterOptions(space.id);
  const locationId = typeof query.location === "string" && filters.locations.some((l) => l.id === query.location) ? query.location : null;
  const categoryId = typeof query.category === "string" && filters.categories.some((c) => c.id === query.category) ? query.category : null;
  const found = await findLabelRows(space.id, { kind, all: true, ids: [], locationId, categoryId });
  const rows = found.map((row) => ({ id: row.id, code: row.code, name: row.name, location: row.location }));
  const slug = space.slug;
  const locations = filters.locations;
  const categories = filters.categories;
  const defaultSize = space.labelSize;

  return (
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <PageHeader title="QR labels" description="Print QR labels on A4 label sheets. Scanning a label opens the item, asset, location, kit or container." />
      <LabelPicker
        key={`${kind}:${locationId ?? ""}:${categoryId ?? ""}`}
        slug={slug}
        kind={kind}
        locationId={locationId}
        categoryId={categoryId}
        rows={rows}
        locations={locations}
        categories={categories}
        defaultSize={defaultSize}
      />
    </div>
  );
}
