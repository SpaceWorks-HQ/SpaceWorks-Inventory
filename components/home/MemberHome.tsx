import Link from "next/link";
import { BorrowingChip, LoanStatusChip } from "@/components/inventory/StatusChips";
import { buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader, EmptyState } from "@/components/ui/display";
import { loanRef } from "@/lib/catalogue/references";
import { formatRelativeDay } from "@/lib/format/datetime";
import type { MemberHome as MemberHomeData } from "@/lib/setup/home";

type LoanRow = MemberHomeData["active"][number];

function LoanList({ slug, timezone, loans, due }: { slug: string; timezone: string; loans: LoanRow[]; due: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {loans.map((loan) => (
        <li key={loan.id} className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-2.5">
          <span className="min-w-0">
            <Link href={`/s/${slug}/my-loans/${loan.id}`} className="font-semibold tabular-nums text-accent-text hover:underline underline-offset-4">{loanRef(loan.number)}</Link>
            <span className="ml-2 text-body-ui text-ink-secondary">{loan.items}</span>
            {due ? <span className="block text-caption text-ink-muted">Due back {formatRelativeDay(loan.dueAt, timezone).toLowerCase()}</span> : null}
          </span>
          <LoanStatusChip status={loan.status} overdue={loan.overdue} />
        </li>
      ))}
    </ul>
  );
}

/** Member view: what they have out and when it is due, open requests and whether they can borrow. */
export function MemberHome({ slug, timezone, lendingEnabled, data }: { slug: string; timezone: string; lendingEnabled: boolean; data: MemberHomeData }) {
  const borrow = lendingEnabled ? <Link href={`/s/${slug}/catalogue`} className={buttonClasses({ variant: "primary" })}>Borrow something</Link> : null;
  return (
    <div className="space-y-6">
      {data.overdue > 0 ? (
        <Callout tone="danger" role="alert" title={`${data.overdue} ${data.overdue === 1 ? "loan is" : "loans are"} overdue.`}>Please bring them back to the desk as soon as you can.</Callout>
      ) : null}
      <Card>
        <CardHeader title="Borrowing" titleAs="h2" action={<BorrowingChip status={data.standing.status} />} className="mb-2" />
        <p className="text-body-ui text-ink-secondary">
          {data.standing.status === "GOOD" ? (lendingEnabled ? "You can borrow from this space." : "Lending is switched off in this space for now.") : data.standing.note ?? "Ask the space team what to do next."}
        </p>
      </Card>
      {data.active.length === 0 && data.pending.length === 0 ? (
        <EmptyState patch title="Nothing on loan." action={borrow}>Find a tool or part in the catalogue and request it.</EmptyState>
      ) : (
        <>
          {data.active.length > 0 ? (
            <Card>
              <CardHeader title="On loan" titleAs="h2" className="mb-2" action={borrow} />
              <LoanList slug={slug} timezone={timezone} loans={data.active} due />
            </Card>
          ) : null}
          {data.pending.length > 0 ? (
            <Card>
              <CardHeader title="Requests" titleAs="h2" className="mb-2" action={data.active.length === 0 ? borrow : undefined} />
              <LoanList slug={slug} timezone={timezone} loans={data.pending} due={false} />
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
