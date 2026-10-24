import type { Metadata } from "next";
import { IncidentsSection, LoansSection, PaymentsSection, TransfersSection } from "@/components/reports/ActivitySections";
import { ReportTableView } from "@/components/reports/ReportTableView";
import { ReportToolbar } from "@/components/reports/ReportToolbar";
import { LowStockSection, MovementSection, ValuationSection } from "@/components/reports/StockSections";
import { PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
import { formatDate, formatDayShort } from "@/lib/format/datetime";
import { requireSpace } from "@/lib/permissions";
import {
  REPORTS, incidentsReport, incidentsTables, isReportKey, loansReport, loansTables, lowStockReport, lowStockTables, movementReport, movementTables,
  parseRange, paymentsReport, paymentsTables, repairsReport, repairsTables, spendReport, spendTables, transfersReport, transfersTables, valuationReport, valuationTables, type DateRange, type ReportKey,
} from "@/lib/reports";
import { eachDay, startOfDay } from "@/lib/reports/range";

export const metadata: Metadata = { title: "Reports" };

type SpaceInfo = { id: string; timezone: string };

async function loadView(key: ReportKey, space: SpaceInfo, range: DateRange) {
  const day = (date: Date) => formatDate(date, space.timezone);
  switch (key) {
    case "valuation": {
      const [data, spend] = await Promise.all([valuationReport(space.id), spendReport(space.id)]);
      return { key, data, tables: [...valuationTables(data), ...spendTables(spend)] } as const;
    }
    case "low-stock": {
      const data = await lowStockReport(space.id);
      return { key, data, tables: lowStockTables(data) } as const;
    }
    case "movements": {
      const data = await movementReport(space.id, range, space.timezone);
      return { key, data, tables: movementTables(data) } as const;
    }
    case "loans": {
      const data = await loansReport(space.id, range);
      return { key, data, tables: loansTables(data, day) } as const;
    }
    case "incidents": {
      const data = await incidentsReport(space.id, range);
      return { key, data, tables: incidentsTables(data) } as const;
    }
    case "transfers": {
      const data = await transfersReport(space.id, range);
      return { key, data, tables: transfersTables(data, day) } as const;
    }
    case "payments": {
      const data = await paymentsReport(space.id, range);
      return { key, data, tables: paymentsTables(data) } as const;
    }
    case "repairs": {
      const data = await repairsReport(space.id, range, space.timezone);
      return { key, data, tables: repairsTables(data) } as const;
    }
  }
}

function dayLabels(range: DateRange, timeZone: string) {
  const days = eachDay(range.fromDay, range.toDay);
  return { days, labels: days.map((value) => formatDayShort(startOfDay(value, timeZone), timeZone)) };
}

function rangeQuery(range: DateRange) {
  return `from=${range.fromDay}&to=${range.toDay}`;
}

export default async function ReportsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/reports">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const key: ReportKey = isReportKey(query.report) ? query.report : "valuation";
  const meta = REPORTS.find((report) => report.key === key)!;
  const range = parseRange({ from: query.from, to: query.to }, space.timezone);
  const view = await loadView(key, { id: space.id, timezone: space.timezone }, range);
  const base = `/s/${space.slug}/reports`;
  const tabs = REPORTS.map((report) => ({ href: `${base}?report=${report.key}${report.ranged ? `&${rangeQuery(range)}` : ""}`, label: report.label, active: report.key === key }));
  const exportBase = `${base}/export?report=${key}&${rangeQuery(range)}`;
  const period = meta.ranged ? `${formatDayShort(range.from, space.timezone)} to ${formatDayShort(startOfDay(range.toDay, space.timezone), space.timezone)}` : null;
  const days = view.key === "movements" ? dayLabels(range, space.timezone) : null;
  const currency = space.currency;

  return (
    <ListLayout
      header={<PageHeader title="Reports" description={period ? `${meta.description} ${period}.` : meta.description} />}
      toolbar={
        <div className="space-y-4">
          <NavTabs label="Reports" items={tabs} />
          <ReportToolbar report={key} ranged={meta.ranged} fromDay={range.fromDay} toDay={range.toDay} exportBase={exportBase} />
        </div>
      }
    >
      {view.key === "valuation" ? <ValuationSection data={view.data} tables={[...view.tables]} /> : null}
      {view.key === "low-stock" ? <LowStockSection rows={view.data} tables={view.tables} currency={currency} purchasesHref={`/s/${space.slug}/purchases`} /> : null}
      {view.key === "movements" && days ? <MovementSection data={view.data} tables={view.tables} currency={currency} dayLabels={days} /> : null}
      {view.key === "loans" ? <LoansSection data={view.data} tables={view.tables} currency={currency} /> : null}
      {view.key === "incidents" ? <IncidentsSection data={view.data} tables={view.tables} currency={currency} /> : null}
      {view.key === "transfers" ? <TransfersSection data={view.data} tables={view.tables} currency={currency} /> : null}
      {view.key === "payments" ? <PaymentsSection data={view.data} tables={view.tables} currency={currency} /> : null}
      {view.key === "repairs" ? <div className="space-y-6">{view.tables.map((table) => <ReportTableView key={table.title} table={table} currency={currency} />)}</div> : null}
    </ListLayout>
  );
}
