import Link from "next/link";
import { LoanQueueTable } from "@/components/loans/LoanQueueTable";
import { LoanSearch } from "@/components/loans/LoanSearch";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
import { loanRef } from "@/lib/catalogue/references";
import { LOAN_TAB_LABEL, LOAN_TABS, loanQueue, loanTab, type LoanTab } from "@/lib/desk/loansQueue";
import { formatDayShort, formatRelativeDay } from "@/lib/format/datetime";
import { isOverdue } from "@/lib/lending/policy";
import { requireSpace } from "@/lib/permissions";

const DATE_HEADING: Record<LoanTab, string> = { requests: "Needed from", ready: "Due", "on-loan": "Due", overdue: "Was due", closed: "Requested" };
const EMPTY: Record<LoanTab, string> = {
  requests: "No requests waiting. New requests from members show up here.",
  ready: "Nothing is waiting to be collected.",
  "on-loan": "Nothing is out on loan right now.",
  overdue: "Nothing is overdue.",
  closed: "No closed loans yet.",
};

export default async function LoansPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/loans">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "STAFF");
  const query = await searchParams;
  const tab = loanTab(query.tab);
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const queue = await loanQueue(space.id, tab, q);
  const now = new Date();
  const rows = queue.rows.map((loan) => ({
    id: loan.id,
    reference: loanRef(loan.number),
    status: loan.status,
    overdue: isOverdue(loan, now),
    borrowerName: loan.borrowerName,
    borrowerEmail: loan.borrowerEmail,
    items: loan.items,
    units: loan.units,
    selfCheckout: loan.selfCheckout,
    dateLabel: tab === "requests" ? (loan.neededFrom ? formatDayShort(loan.neededFrom, space.timezone) : "Now") : tab === "closed" ? formatDayShort(loan.createdAt, space.timezone) : formatRelativeDay(loan.dueAt, space.timezone, now),
  }));
  const tabs = LOAN_TABS.map((t) => ({ href: `/s/${space.slug}/loans?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: `${LOAN_TAB_LABEL[t]} (${queue.counts[t]})`, active: t === tab }));
  const slug = space.slug;
  const dateHeading = DATE_HEADING[tab];
  const emptyText = q ? "No loans match that search." : EMPTY[tab];
  const nothingYet = !q && LOAN_TABS.every((t) => queue.counts[t] === 0);

  return (
    <ListLayout
      header={<PageHeader title="Loans" description="Approve requests, hand items over and take them back." />}
      toolbar={
        <div className="flex flex-col gap-4">
          <NavTabs label="Loan queue" items={tabs} />
          <LoanSearch key={`${tab}:${q}`} slug={slug} tab={tab} query={q} />
        </div>
      }
    >
      {rows.length ? <LoanQueueTable slug={slug} rows={rows} dateHeading={dateHeading} /> : nothingYet ? (
        <EmptyState patch title="No loans yet." action={<Link href={`/s/${slug}/catalogue`} className={buttonClasses({ variant: "secondary" })}>Open the borrowing catalogue</Link>}>Members request tools from the catalogue; requests land here.</EmptyState>
      ) : <EmptyState>{emptyText}</EmptyState>}
    </ListLayout>
  );
}
