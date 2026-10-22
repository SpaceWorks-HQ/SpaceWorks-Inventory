// Generated from app/s/[spaceSlug]/layout.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { getShellData } from "@/lib/appShell";
import { requireSpace } from "@/lib/permissions";

export async function loadSpaceLayout({ children, params }: LayoutProps<"/s/[spaceSlug]">) {
const { spaceSlug } = await params;
const { user, space, membership } = await requireSpace(spaceSlug);
const data = await getShellData(user, space, membership);
return viewDto({ data } as const);
}
