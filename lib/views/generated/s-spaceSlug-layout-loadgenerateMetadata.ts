// Generated from app/s/[spaceSlug]/layout.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";

export async function loadgenerateMetadata({ params }: LayoutProps<"/s/[spaceSlug]">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "TECHNICIAN");
return { title: { default: space.name, template: `%s · ${space.name}` } };

}
