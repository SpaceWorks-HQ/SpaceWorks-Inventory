// Generated from app/q/[code]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { resolveQrLanding } from "@/lib/setup/qrLanding";

export async function loadQrLandingPage({ params }: PageProps<"/q/[code]">) {
const { code } = await params;
const user = await getCurrentUser();
const allowed = await checkRateLimitById("scan", user ? `user:${user.id}` : `ip:${getClientIpFromHeaders(await headers())}`);
const decision = allowed ? await resolveQrLanding(code.slice(0, 200), user?.id ?? null) : { type: "neutral" as const, signedIn: Boolean(user) };
if (decision.type === "redirect") redirect(decision.url);
const signedIn = decision.signedIn;
const loginHref = `/login?callbackUrl=${encodeURIComponent(`/q/${encodeURIComponent(code.slice(0, 64))}`)}`;
return viewDto({ signedIn, loginHref } as const);
}
