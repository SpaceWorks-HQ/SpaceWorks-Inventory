import Link from "next/link";
import { redirect } from "next/navigation";
import { MemberHome } from "@/components/home/MemberHome";
import { StaffHome } from "@/components/home/StaffHome";
import { buttonClasses } from "@/components/ui/button";
import { Callout, PageHeader, StatTile } from "@/components/ui/display";
import { DashboardLayout } from "@/components/ui/layouts";
import { requireSpace } from "@/lib/permissions";
import { financeKpis } from "@/lib/finance/kpis";
import { formatMoney } from "@/lib/format/money";
import { canManageSpace, canViewFinance, canViewStock } from "@/lib/roles";
import { memberHome, staffHome } from "@/lib/setup/home";

function greeting(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hello, ${first}` : "Hello";
}

export default async function SpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
  const { spaceSlug } = await params;
  const { space, user, membership } = await requireSpace(spaceSlug, "TECHNICIAN");
  // Technicians only see repairs.
  if (membership.role === "TECHNICIAN") redirect(`/s/${space.slug}/repairs`);
  const isStaff = canViewStock(membership);
  const staff = isStaff ? await staffHome({ id: space.id, timezone: space.timezone }) : null;
  const member = isStaff ? null : await memberHome(space.id, user.id);
  // Money is for inventory managers only (owner decision 2026-10-24).
  const money = canViewFinance(membership) ? await financeKpis({ id: space.id, timezone: space.timezone }) : null;
  const currency = space.currency;
  const needsSetup = space.setupCompletedAt === null && canManageSpace(membership);
  const slug = space.slug;
  const timezone = space.timezone;
  const lendingEnabled = space.lendingEnabled;
  const title = greeting(user.name);
  const description = space.tagline ?? `Welcome to ${space.name}.`;

  return (
    <DashboardLayout
      header={<PageHeader kicker={space.name} title={title} description={description} />}
      stats={money ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Money in this month" value={formatMoney(money.inMinor, currency)} href={`/s/${slug}/finance`} />
          <StatTile label="Money out this month" value={formatMoney(money.outMinor, currency)} href={`/s/${slug}/finance`} />
          <StatTile label="Net this month" value={formatMoney(money.netMinor, currency)} tone={money.netMinor < 0 ? "attention" : "default"} href={`/s/${slug}/finance`} />
          <StatTile label="Open repairs" value={String(money.openRepairs)} href={`/s/${slug}/repairs`} />
        </div>
      ) : undefined}
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
