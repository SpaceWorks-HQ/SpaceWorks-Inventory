import type { Metadata } from "next";
import { AuthFrame } from "@/components/chrome/AuthFrame";
import { MagicLinkSignIn } from "@/components/auth/MagicLinkSignIn";
import { safeAuthRedirect } from "@/lib/authRedirect";

export const metadata: Metadata = { title: "Sign in with your link", referrer: "no-referrer" };

/**
 * Landing page for an emailed sign-in link. Opening it never spends the
 * link (mail scanners prefetch URLs); the button below does.
 */
export default async function MagicLinkPage({ params, searchParams }: PageProps<"/login/link/[token]">) {
  const { token } = await params;
  const next = (await searchParams).next;
  return (
    <AuthFrame title="Almost in." description="Confirm to sign in on this device.">
      <MagicLinkSignIn token={token} next={safeAuthRedirect(typeof next === "string" ? next : null)} />
    </AuthFrame>
  );
}
