import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/**
 * Period picker (a plain GET form, so it works without JavaScript) and the
 * CSV / XLSX downloads for the open report.
 */
export function ReportToolbar({ report, ranged, fromDay, toDay, exportBase }: { report: string; ranged: boolean; fromDay: string; toDay: string; exportBase: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-panel p-4 md:flex-row md:items-end md:justify-between">
      {ranged ? (
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
          <input type="hidden" name="report" value={report} />
          <Field label="From">
            <Input type="date" name="from" defaultValue={fromDay} max={toDay} />
          </Field>
          <Field label="To">
            <Input type="date" name="to" defaultValue={toDay} />
          </Field>
          <Button type="submit" variant="secondary">Show period</Button>
        </form>
      ) : (
        <p className="text-body-ui text-ink-muted">Shows stock as it is right now.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary"><a href={`${exportBase}&format=csv`} download>Download CSV</a></Button>
        <Button asChild variant="secondary"><a href={`${exportBase}&format=xlsx`} download>Download XLSX</a></Button>
      </div>
    </div>
  );
}
