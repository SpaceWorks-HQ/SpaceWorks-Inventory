// Generated from app/login/link/[token]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";


export async function loadMagicLinkPage({ params, searchParams }: PageProps<"/login/link/[token]">) {
const { token } = await params;
const next = (await searchParams).next;
return viewDto({ next } as const);
}
