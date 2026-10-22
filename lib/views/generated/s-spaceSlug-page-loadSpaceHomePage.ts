// Generated from app/s/[spaceSlug]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { requireSpace } from "@/lib/permissions";

export async function loadSpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
const { spaceSlug } = await params;
const { space } = await requireSpace(spaceSlug);
return viewDto({ space } as const);
}
