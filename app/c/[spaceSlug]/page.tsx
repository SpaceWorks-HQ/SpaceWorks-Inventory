import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SimpleShell } from "@/components/chrome/SimpleShell";
import { JoinSpaceButton } from "@/components/public/JoinSpaceButton";
import { PublicItemCard } from "@/components/public/PublicItemCard";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, OrgLogo, PageHeader } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { publicCatalogue } from "@/lib/setup/publicCatalogue";

export const metadata: Metadata = { title: "Catalogue" };

function pick(value: string | string[] | undefined) {
  return typeof value === "string" ? value.slice(0, 64) : null;
}

const chipClass = "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors duration-[200ms] ease-yy";

/** What a space lends, for anyone with the link. 404 unless the space publishes its catalogue. */
export default async function PublicCataloguePage({ params, searchParams }: PageProps<"/c/[spaceSlug]">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  if (!(await checkRateLimitById("publicCatalogue", `ip:${getClientIpFromHeaders(await headers())}`))) notFound();
  const catalogue = await publicCatalogue(spaceSlug);
  if (!catalogue) notFound();
  const user = await getCurrentUser();
  const membership = user ? await prisma.membership.findUnique({ where: { userId_spaceId: { userId: user.id, spaceId: catalogue.space.id } }, select: { status: true } }) : null;
  const isMember = membership?.status === "ACTIVE";
  const category = pick(query.category);
  const highlighted = pick(query.item);
  const items = catalogue.items.filter((item) => !category || item.categoryId === category);
  const space = catalogue.space;
  const base = `/c/${encodeURIComponent(space.slug)}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(base)}`;

  return (
    <SimpleShell backHref={isMember ? `/s/${space.slug}` : "/"} backLabel={isMember ? "Open the space" : "Home"}>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <OrgLogo name={space.name} src={space.hasLogo ? `/api/s/${encodeURIComponent(space.slug)}/logo` : null} size="lg" />
          <PageHeader
            className="flex-1"
            title={space.name}
            description={space.tagline ?? (space.freeLending ? "Tools and parts members can borrow for free." : "Tools and parts members can borrow.")}
            actions={isMember ? (
              <Link href={`/s/${space.slug}/catalogue`} className={buttonClasses({ variant: "primary" })}>Borrow something</Link>
            ) : user && space.selfJoin ? (
              <JoinSpaceButton slug={space.slug} spaceName={space.name} />
            ) : user ? undefined : (
              <Link href={loginHref} className={buttonClasses({ variant: "primary" })}>Sign in to borrow</Link>
            )}
          />
        </div>
        {user && !isMember && !space.selfJoin ? <Callout tone="info">Borrowing is for members of {space.name}. Ask the space team for an invitation.</Callout> : null}
        {!space.lendingEnabled ? <Callout tone="warning" title="Lending is paused.">Items are shown for reference; requests open again soon.</Callout> : null}
        {catalogue.categories.length > 0 ? (
          <nav aria-label="Categories" className="flex flex-wrap gap-2">
            {[{ id: null, name: "Everything" }, ...catalogue.categories].map((entry) => {
              const active = entry.id === category;
              return (
                <Link
                  key={entry.id ?? "all"}
                  href={entry.id ? `${base}?category=${entry.id}` : base}
                  aria-current={active ? "page" : undefined}
                  className={cn(chipClass, active ? "border-accent-text bg-primary text-on-primary" : "border-line-strong bg-panel text-ink-secondary hover:bg-subtle hover:text-ink")}
                >
                  {entry.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
        {items.length === 0 ? (
          <EmptyState patch title="Nothing listed here yet.">Check back soon, or ask the space team what you can borrow.</EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => <PublicItemCard key={item.id} item={item} highlighted={item.id === highlighted} />)}
          </ul>
        )}
        {space.address ? <p className="text-caption text-ink-muted">{space.address}</p> : null}
      </div>
    </SimpleShell>
  );
}
