import Link from "next/link";
import { MemberHome } from "@/components/home/MemberHome";
import { StaffHome } from "@/components/home/StaffHome";
import { buttonClasses } from "@/components/ui/button";
import { Callout, PageHeader } from "@/components/ui/display";
import { DashboardLayout } from "@/components/ui/layouts";
import { requireSpace } from "@/lib/permissions";
import { canManageSpace, canViewStock } from "@/lib/roles";
import { memberHome, staffHome } from "@/lib/setup/home";

function greeting(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hello, ${first}` : "Hello";
}

export default async function SpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
  const { spaceSlug } = await params;
  const { space, user, membership } = await requireSpace(spaceSlug, "MEMBER");
  const isStaff = canViewStock(membership);
  const staff = isStaff ? await staffHome({ id: space.id, timezone: space.timezone }) : null;
  const member = isStaff ? null : await memberHome(space.id, user.id);
  const needsSetup = space.setupCompletedAt === null && canManageSpace(membership);
  const slug = space.slug;
  const timezone = space.timezone;
  const lendingEnabled = space.lendingEnabled;
  const title = greeting(user.name);
  const description = space.tagline ?? `Welcome to ${space.name}.`;

  return (
    <DashboardLayout
      header={<PageHeader kicker={space.name} title={title} description={description} />}
      actions={needsSetup ? (
        <Callout
          tone="info"
          title="Finish setting up this space."
          action={<Link href={`/s/${slug}/setup`} className={buttonClasses({ variant: "secondary" })}>Continue setup</Link>}
        >
          Add locations, categories, your team and lending rules. It takes a few minutes.
        </Callout>
      ) : undefined}
    >
      {staff ? <StaffHome slug={slug} timezone={timezone} data={staff} /> : null}
      {member ? <MemberHome slug={slug} timezone={timezone} lendingEnabled={lendingEnabled} data={member} /> : null}
    </DashboardLayout>
  );
}
