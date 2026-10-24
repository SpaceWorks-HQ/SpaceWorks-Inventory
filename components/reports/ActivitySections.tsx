import { EmptyState, StatTile } from "@/components/ui/display";
import { formatMoney } from "@/lib/format/money";
import type { IncidentsReport, LoansReport, PaymentsReport, TransfersReport } from "@/lib/reports";
import type { ReportTable } from "@/lib/reports/table";
import { BarChart } from "./BarChart";
import { ReportTableView } from "./ReportTableView";

const count = (value: number) => new Intl.NumberFormat("en-IN").format(value);

function Tables({ tables, currency }: { tables: ReportTable[]; currency: string }) {
  return <>{tables.map((table) => <ReportTableView key={table.title} table={table} currency={currency} />)}</>;
}

export function LoansSection({ data, tables, currency }: { data: LoansReport; tables: ReportTable[]; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Active loans" value={count(data.activeLoans)} hint={`${count(data.unitsOut)} units out`} />
        <StatTile label="Overdue" value={count(data.overdue.length)} tone={data.overdue.length > 0 ? "attention" : "default"} hint={data.overdue.length ? `Longest ${data.overdue[0]!.daysOverdue} days` : undefined} />
        <StatTile label="Issued in period" value={count(data.issuedInRange)} />
        <StatTile label="Lendable units out now" value={`${Math.round(data.utilisation * 100)}%`} hint="Share of returnable lendable units on loan" progress={{ value: Math.round(data.utilisation * 100), max: 100 }} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BarChart id="loans-items" title="Most borrowed items" bars={data.mostBorrowed.map((row) => ({ label: row.name, value: row.loans, display: `${count(row.loans)} ${row.loans === 1 ? "loan" : "loans"}` }))} />
        <BarChart id="loans-overdue" title="Days overdue" bars={data.overdue.map((row) => ({ label: `${row.reference} · ${row.borrowerName ?? "Member"}`, value: row.daysOverdue, display: `${row.daysOverdue} ${row.daysOverdue === 1 ? "day" : "days"}` }))} />
      </div>
      <Tables tables={tables} currency={currency} />
    </div>
  );
}

export function IncidentsSection({ data, tables, currency }: { data: IncidentsReport; tables: ReportTable[]; currency: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Open now" value={count(data.openNow)} tone={data.openNow > 0 ? "attention" : "default"} />
        <StatTile label="Raised in period" value={count(data.raisedInRange)} />
        <StatTile label="Resolved in period" value={count(data.resolvedInRange)} />
        <StatTile label="Units lost or damaged" value={count(data.lostUnits + data.damagedUnits)} hint={`${count(data.lostUnits)} lost · ${count(data.damagedUnits)} damaged`} />
      </div>
      <BarChart id="incidents-items" title="Lost or damaged units by item" bars={data.byItem.map((row) => ({ label: row.name, value: row.lost + row.damaged, display: count(row.lost + row.damaged) }))} />
      <Tables tables={tables} currency={currency} />
    </div>
  );
}

export function TransfersSection({ data, tables, currency }: { data: TransfersReport; tables: ReportTable[]; currency: string }) {
  const discrepancyUnits = data.discrepancies.reduce((sum, row) => sum + row.damaged + row.missing, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Sent in period" value={count(data.outCount)} />
        <StatTile label="Received in period" value={count(data.inCount)} />
        <StatTile label="Units in transit now" value={count(data.unitsInTransit)} hint={`${data.inTransitNow.length} ${data.inTransitNow.length === 1 ? "transfer" : "transfers"}`} />
        <StatTile label="Damaged or missing" value={count(discrepancyUnits)} tone={discrepancyUnits > 0 ? "attention" : "default"} />
      </div>
      <BarChart id="transfers-out" title="Transfers out by space" bars={data.outBySpace.map((row) => ({ label: row.spaceName, value: row.transfers, display: count(row.transfers) }))} />
      <Tables tables={tables} currency={currency} />
    </div>
  );
}

export function PaymentsSection({ data, tables, currency }: { data: PaymentsReport; tables: ReportTable[]; currency: string }) {
  if (!data.hasPayments) return <EmptyState title="No payments yet.">Payments show here once members pay deposits, rental or fees.</EmptyState>;
  const money = (minor: number) => formatMoney(minor, currency);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Collected" value={money(data.collectedMinor)} hint={`${count(data.collectedCount)} payments in period`} />
        <StatTile label="Pending now" value={money(data.pendingMinor)} hint={data.payLaterMinor ? `${money(data.payLaterMinor)} pay later` : undefined} />
        <StatTile label="Refunded" value={money(data.refundedMinor)} hint="In period" />
        <StatTile label="Waived" value={money(data.waivedMinor)} hint="In period" />
      </div>
      <BarChart id="payments-method" title="Collected by method" bars={data.byProvider.map((row) => ({ label: row.label, value: row.amountMinor, display: money(row.amountMinor) }))} />
      <Tables tables={tables} currency={currency} />
    </div>
  );
}
