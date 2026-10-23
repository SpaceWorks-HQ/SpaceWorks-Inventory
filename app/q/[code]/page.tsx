import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SimpleShell } from "@/components/chrome/SimpleShell";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { resolveQrLanding } from "@/lib/setup/qrLanding";

export const metadata: Metadata = { title: "Scanned label", robots: { index: false, follow: false } };

/**
 * Where a printed QR label leads. Members of the owning space go straight
 * to the right page; everyone else sees the public catalogue entry when the
 * space publishes it, or the same neutral page for every other code.
 */
export default async function QrLandingPage({ params }: PageProps<"/q/[code]">) {
  const { code } = await params;
  const user = await getCurrentUser();
  const allowed = await checkRateLimitById("scan", user ? `user:${user.id}` : `ip:${getClientIpFromHeaders(await headers())}`);
  const decision = allowed ? await resolveQrLanding(code.slice(0, 200), user?.id ?? null) : { type: "neutral" as const, signedIn: Boolean(user) };
  if (decision.type === "redirect") redirect(decision.url);
  const signedIn = decision.signedIn;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(`/q/${encodeURIComponent(code.slice(0, 64))}`)}`;

  return (
    <SimpleShell backHref="/" backLabel="Home">
      {signedIn ? (
        <EmptyState patch title="You don't have access to this label." action={<Link href="/" className={buttonClasses({ variant: "secondary" })}>Go to your spaces</Link>}>
          It belongs to a space you aren&apos;t a member of. Ask the space team for an invitation.
        </EmptyState>
      ) : (
        <EmptyState patch title="Sign in to see this item." action={<Link href={loginHref} className={buttonClasses({ variant: "primary" })}>Sign in</Link>}>
          Labels open the item, shelf or kit for members of the space.
        </EmptyState>
      )}
    </SimpleShell>
  );
}
