// Generated from app/r/[token]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { findLinkRequest, linkView } from "@/lib/repairs";

export async function loadRepairLinkPage({ params }: PageProps<"/r/[token]">) {
const { token } = await params;
const found = await findLinkRequest(token);
const view = found ? await linkView(found) : null;
return viewDto({ view } as const);
}
