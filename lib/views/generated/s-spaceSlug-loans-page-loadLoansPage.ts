// Generated from app/s/[spaceSlug]/loans/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
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
export async function loadLoansPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/loans">) {
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
const filtered = Boolean(q.trim()) || tab !== "requests";
const emptyText = filtered ? "No loans match these filters." : EMPTY[tab];
const nothingYet = !filtered && LOAN_TABS.every((t) => queue.counts[t] === 0);
return viewDto({ tab, q, rows, tabs, slug, dateHeading, filtered, emptyText, nothingYet } as const);
}
