import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/chrome/AuthFrame";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { Callout } from "@/components/ui/display";
import { getCurrentUser } from "@/lib/permissions";
import { isSetupOpen } from "@/lib/setup";
import { LAST_SPACE_COOKIE } from "@/lib/spaceCookie";
import { listUserSpaces } from "@/lib/spaces";
import { prisma } from "@/lib/db";

export const metadata: Metadata = { title: "Space Works Inventory" };

/** Entry point: setup → sign in → last (or first) space → "no space yet". */
export default async function HomeRedirect() {
  if (await isSetupOpen()) redirect("/setup");
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const spaces = await listUserSpaces(user.id);
  const last = (await cookies()).get(LAST_SPACE_COOKIE)?.value;
  const target = spaces.find((space) => space.slug === last) ?? spaces[0];
  if (target) redirect(`/s/${target.slug}`);
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { isInstanceAdmin: true } });
  return (
    <AuthFrame title="No space yet." description={`You're signed in as ${user.email}, but you aren't a member of any makerspace here.`}>
      <Callout tone="info">Ask a space admin to invite you, or open a space&apos;s public catalogue and join from there when it allows it.</Callout>
      <div className="flex flex-wrap gap-2">
        {account?.isInstanceAdmin ? <a href="/admin" className="text-sm font-semibold text-ink underline underline-offset-4">Open instance admin</a> : null}
        <SignOutButton />
      </div>
    </AuthFrame>
  );
}
