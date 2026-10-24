// Generated from app/s/[spaceSlug]/scan/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";

export async function loadScanPage({ params }: PageProps<"/s/[spaceSlug]/scan">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "STAFF");
const slug = space.slug;
return viewDto({ slug } as const);
}
