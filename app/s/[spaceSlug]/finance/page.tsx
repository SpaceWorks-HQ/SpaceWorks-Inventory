import type { Metadata } from "next";
import { FinanceEntries } from "@/components/finance/FinanceEntries";
import { FinanceEntryDialog } from "@/components/finance/FinanceEntryDialog";
import { FinanceToolbar } from "@/components/finance/FinanceToolbar";
import { ReportTableView } from "@/components/reports/ReportTableView";
import { Callout, PageHeader, StatTile } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { financeReport, financeTables, ledgerCheck } from "@/lib/finance";
import { isPeriodGroup } from "@/lib/finance/periods";
import { formatMoney } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { parseRange } from "@/lib/reports/range";

export const metadata: Metadata = { title: "Finance" };

/** Every money movement of the space: income, expenses and net, by period and source. Inventory managers only. */
export default async function FinancePage({ params, searchParams }: PageProps<"/s/[spaceSlug]/finance">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const range = parseRange({ from: query.from, to: query.to }, space.timezone, new Date(), 366 * 5);
  const group = isPeriodGroup(query.group) ? query.group : "month";
  const [report, check] = await Promise.all([financeReport({ id: space.id, slug: space.slug, timezone: space.timezone }, range, group), ledgerCheck(space.id)]);
  const tables = financeTables(report);
  const currency = space.currency;
  const exportBase = `/s/${space.slug}/finance/export?from=${range.fromDay}&to=${range.toDay}&group=${group}`;

  return (
    <ListLayout
      header={<PageHeader title="Finance" description="Every money movement in this space: loan payments, refunds, repair payouts, purchases and manual entries. Corrections are reversing entries." actions={<FinanceEntryDialog slug={space.slug} currency={currency} />} />}
      toolbar={<FinanceToolbar fromDay={range.fromDay} toDay={range.toDay} group={group} exportBase={exportBase} />}
    >
      {check.ok ? null : <Callout tone="danger" title="The ledger doesn't match its sources.">{check.problems.join("; ")}. Check recent changes and contact your administrator.</Callout>}
      {report.truncated ? <Callout tone="warning">This period has too many entries to total here. Choose a shorter period.</Callout> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Money in" value={formatMoney(report.totals.inMinor, currency)} />
        <StatTile label="Money out" value={formatMoney(report.totals.outMinor, currency)} />
        <StatTile label="Net" value={formatMoney(report.totals.netMinor, currency)} tone={report.totals.netMinor < 0 ? "attention" : "default"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {tables.slice(1, 7).map((table) => <ReportTableView key={table.title} table={table} currency={currency} />)}
      </div>
      <FinanceEntries slug={space.slug} currency={currency} entries={report.entries} />
    </ListLayout>
  );
}
