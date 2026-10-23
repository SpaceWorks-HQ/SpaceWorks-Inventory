// Generated from app/s/[spaceSlug]/counts/new/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { countFormOptions } from "@/lib/desk/counts";
import { requireSpace } from "@/lib/permissions";

export async function loadNewCountPage({ params }: PageProps<"/s/[spaceSlug]/counts/new">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "MANAGER");
const options = await countFormOptions(space.id);
const slug = space.slug;
const locations = options.locations;
const categories = options.categories;
return viewDto({ slug, locations, categories } as const);
}
