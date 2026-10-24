import type { Metadata } from "next";
import { SimpleShell } from "@/components/chrome/SimpleShell";
import { AppearanceCard } from "@/components/account/AppearanceCard";
import { MfaCard } from "@/components/account/MfaCard";
import { PasswordForm } from "@/components/account/PasswordForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { SessionsCard } from "@/components/account/SessionsCard";
import { Button } from "@/components/ui/button";
import { Card, PageHeader, SettingsRow } from "@/components/ui/display";
import { prisma } from "@/lib/db";
import { remainingRecoveryCodes } from "@/lib/mfa";
import { requireAuth } from "@/lib/permissions";
import { roleLabel } from "@/lib/roles";
import { listUserSpaces } from "@/lib/spaces";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const sessionUser = await requireAuth();
  const [user, spaces, remaining] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: sessionUser.id },
      select: { name: true, email: true, phone: true, passwordHash: true, mfaEnabledAt: true },
    }),
    listUserSpaces(sessionUser.id),
    remainingRecoveryCodes(sessionUser.id),
  ]);
  const hasPassword = Boolean(user.passwordHash);
  return (
    <SimpleShell>
      <div className="flex flex-col gap-6">
        <PageHeader title="Your account" description={user.email} />
        <Card padding="lg">
          <SettingsRow title="Profile" description="Shown to staff on your loans in every space.">
            <ProfileForm initial={{ name: user.name ?? "", phone: user.phone ?? "" }} />
          </SettingsRow>
          <SettingsRow title="Password" description={hasPassword ? "Changing it signs you out on every device." : "You sign in with emailed links. Add a password if you like."}>
            <PasswordForm hasPassword={hasPassword} />
          </SettingsRow>
          <SettingsRow title="Two-step verification" description="A code from your phone at every sign-in.">
            <MfaCard enabled={Boolean(user.mfaEnabledAt)} remainingCodes={remaining} />
          </SettingsRow>
          <SettingsRow title="Appearance" description="Saved in this browser only.">
            <AppearanceCard />
          </SettingsRow>
          <SettingsRow title="Sessions" description="Lost a device? Sign out of every session at once.">
            <SessionsCard />
          </SettingsRow>
          <SettingsRow title="Your data" description="A JSON copy of your profile, memberships, loans and notifications.">
            <Button asChild variant="secondary">
              <a href="/api/account/export" download>Download my data</a>
            </Button>
          </SettingsRow>
          <SettingsRow title="Spaces" description="Where you're a member.">
            {spaces.length === 0 ? (
              <p className="text-body-ui text-ink-muted">You aren&apos;t in any space yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {spaces.map((space) => (
                  <li key={space.id} className="flex items-center justify-between gap-3">
                    <a href={`/s/${space.slug}`} className="font-semibold text-ink underline-offset-4 hover:underline">{space.name}</a>
                    <span className="text-caption text-ink-muted">{roleLabel(space.role)}</span>
                  </li>
                ))}
              </ul>
            )}
          </SettingsRow>
        </Card>
      </div>
    </SimpleShell>
  );
}
