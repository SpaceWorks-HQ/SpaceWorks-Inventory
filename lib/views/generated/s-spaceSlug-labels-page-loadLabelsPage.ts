// Generated from app/s/[spaceSlug]/labels/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { findLabelRows, LABEL_KINDS, labelFilterOptions } from "@/lib/labels";
import { requireSpace } from "@/lib/permissions";

export async function loadLabelsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/labels">) {
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
return viewDto({ kind, locationId, categoryId, rows, slug, locations, categories, defaultSize } as const);
}
