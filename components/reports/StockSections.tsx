import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout, StatTile } from "@/components/ui/display";
import { formatMoney } from "@/lib/format/money";
import type { LowStockRow, MovementReport, ValuationReport } from "@/lib/reports";
import type { ReportTable } from "@/lib/reports/table";
import { BarChart } from "./BarChart";
import { LineChart } from "./LineChart";
import { ReportTableView } from "./ReportTableView";

const count = (value: number) => new Intl.NumberFormat("en-IN").format(value);

function Tables({ tables, currency }: { tables: ReportTable[]; currency: string }) {
  return <>{tables.map((table) => <ReportTableView key={table.title} table={table} currency={currency} />)}</>;
}

export function ValuationSection({ data, tables }: { data: ValuationReport; tables: ReportTable[] }) {
  const money = (minor: number) => formatMoney(minor, data.currency);
  const units = data.items.reduce((sum, row) => sum + row.onHand, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Stock value" value={money(data.totalMinor)} hint="On hand × average cost" />
        <StatTile label="Units on hand" value={count(units)} />
        <StatTile label="In transit" value={money(data.inTransitMinor)} hint="Sent, not yet received" />
        <StatTile label="Items with stock" value={count(data.items.filter((row) => row.onHand > 0).length)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <BarChart id="valuation-category" title="Value by category" bars={data.byCategory.map((row) => ({ label: row.name, value: row.valueMinor, display: money(row.valueMinor) }))} />
        <BarChart id="valuation-location" title="Value by location" bars={data.byLocation.map((row) => ({ label: `${row.code} · ${row.name}`, value: row.valueMinor, display: money(row.valueMinor) })).sort((a, b) => b.value - a.value)} />
      </div>
      <Tables tables={tables} currency={data.currency} />
    </div>
  );
}

export function LowStockSection({ rows, tables, currency, purchasesHref }: { rows: LowStockRow[]; tables: ReportTable[]; currency: string; purchasesHref: string }) {
  const short = rows.filter((row) => row.onOrder === 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="At or below reorder point" value={count(rows.length)} tone={rows.length > 0 ? "attention" : "default"} />
        <StatTile label="Not on the buy list" value={count(short.length)} />
        <StatTile label="Out of stock" value={count(rows.filter((row) => row.available <= 0).length)} />
        <StatTile label="Units on order" value={count(rows.reduce((sum, row) => sum + row.onOrder, 0))} />
      </div>
      {short.length > 0 ? (
        <Callout tone="warning" title={`${short.length} low ${short.length === 1 ? "item isn't" : "items aren't"} on the buy list yet.`} action={<Button asChild variant="secondary"><Link href={purchasesHref}>Open the buy list</Link></Button>}>
          Add them from the reorder suggestions on the buy list.
        </Callout>
      ) : null}
      <BarChart id="low-stock-gap" title="Shortfall below reorder point" bars={rows.map((row) => ({ label: row.name, value: row.reorderPoint - row.available + 1, display: `${count(row.available)} of ${count(row.reorderPoint)}` }))} />
      <Tables tables={tables} currency={currency} />
    </div>
  );
}

export function MovementSection({ data, tables, currency, dayLabels }: { data: MovementReport; tables: ReportTable[]; currency: string; dayLabels: { days: string[]; labels: string[] } }) {
  const byDay = new Map(data.daily.map((row) => [row.day, row]));
  const unitsIn = dayLabels.days.map((day) => byDay.get(day)?.unitsIn ?? 0);
  const unitsOut = dayLabels.days.map((day) => byDay.get(day)?.unitsOut ?? 0);
  const totalIn = unitsIn.reduce((a, b) => a + b, 0);
  const totalOut = unitsOut.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Units received" value={count(data.receivedUnits)} hint={formatMoney(data.receivedValueMinor, currency)} />
        <StatTile label="Units written off" value={count(data.writtenOffUnits)} hint="Lost, damaged or written off" tone={data.writtenOffUnits > 0 ? "attention" : "default"} />
        <StatTile label="Count corrections" value={`${data.countVariance > 0 ? "+" : ""}${count(data.countVariance)}`} hint={`${data.countsPosted} ${data.countsPosted === 1 ? "count" : "counts"} posted`} />
        <StatTile label="Adjustments" value={count(data.adjustments.reduce((sum, row) => sum + row.movements, 0))} />
      </div>
      <LineChart
        title="Units in and out per day"
        days={dayLabels.labels}
        series={[{ label: "Units in", values: unitsIn }, { label: "Units out", values: unitsOut, dashed: true }]}
        summary={`${count(totalIn)} units in and ${count(totalOut)} units out from ${dayLabels.labels[0]} to ${dayLabels.labels[dayLabels.labels.length - 1]}.`}
      />
      <BarChart id="movements-type" title="Movements by type" bars={data.byType.map((row) => ({ label: row.label, value: row.movements, display: count(row.movements) }))} />
      <Tables tables={tables} currency={currency} />
    </div>
  );
}
