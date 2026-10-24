import Link from "next/link";
import { MyLoansTable } from "@/components/loans/MyLoansTable";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader, SectionHeading } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { loanRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { memberLoans } from "@/lib/desk/loansMember";
import { formatDayShort, formatRelativeDay } from "@/lib/format/datetime";
import { checkBorrowingEligibility } from "@/lib/lending/access";
import { isOverdue } from "@/lib/lending/policy";
import { requireSpace } from "@/lib/permissions";

export default async function MyLoansPage({ params }: PageProps<"/s/[spaceSlug]/my-loans">) {
  const { spaceSlug } = await params;
  const { space, user } = await requireSpace(spaceSlug, "MEMBER");
  const loans = await memberLoans(space.id, user.id);
  const eligibility = await checkBorrowingEligibility(prisma, { spaceId: space.id, userId: user.id, incomingUnits: 0 });
  const blocked = eligibility.ok ? null : eligibility.error;
  const now = new Date();
  const tz = space.timezone;
  const rows = loans.map((loan) => ({
    id: loan.id,
    reference: loanRef(loan.number),
    status: loan.status,
    overdue: isOverdue(loan, now),
    items: loan.items,
    out: loan.out,
    open: loan.open,
    dateLabel: loan.open ? `Due ${formatRelativeDay(loan.dueAt, tz, now)}` : formatDayShort(loan.createdAt, tz, now),
  }));
  const open = rows.filter((row) => row.open);
  const past = rows.filter((row) => !row.open);
  const slug = space.slug;
  const lendingOn = space.lendingEnabled;

  return (
    <ListLayout
      header={<PageHeader title="My loans" description="What you've borrowed, what's due back and requests waiting at the desk." actions={lendingOn ? <Link href={`/s/${slug}/catalogue`} className={buttonClasses({ variant: "primary" })}>Borrow something</Link> : undefined} />}
    >
      {blocked ? <Callout tone="warning" title="You can't borrow right now">{blocked}</Callout> : null}
      {rows.length === 0 ? (
        <EmptyState patch title="No loans yet." action={lendingOn ? <Link href={`/s/${slug}/catalogue`} className={buttonClasses({ variant: "secondary" })}>Open the catalogue</Link> : undefined}>Borrow a tool from the catalogue and it shows up here.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <section aria-label="Open loans" className="flex flex-col gap-3">
            <SectionHeading title="Open" description="Requests, loans ready to collect and things you still have." />
            {open.length ? <MyLoansTable slug={slug} rows={open} label="Open loans" /> : <EmptyState>Nothing out right now.</EmptyState>}
          </section>
          {past.length ? (
            <section aria-label="Past loans" className="flex flex-col gap-3">
              <SectionHeading title="Past" />
              <MyLoansTable slug={slug} rows={past} label="Past loans" />
            </section>
          ) : null}
        </div>
      )}
    </ListLayout>
  );
}
