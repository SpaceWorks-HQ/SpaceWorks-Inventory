// Generated from app/s/[spaceSlug]/mentor/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";

export async function loadMentorPage({ params }: PageProps<"/s/[spaceSlug]/mentor">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug, "STAFF");
const slug = space.slug;
return viewDto({ slug } as const);
}
