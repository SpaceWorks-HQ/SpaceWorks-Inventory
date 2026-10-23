import { EmptyState, SectionHeading } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format/money";
import type { Cell, Column, ReportTable } from "@/lib/reports/table";

function display(column: Column, value: Cell, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (column.kind === "money" && typeof value === "number") return formatMoney(value, currency);
  if (typeof value === "number") return new Intl.NumberFormat("en-IN").format(value);
  return value;
}

/** One report table, exactly as it is exported (numbers right-aligned, money in the space currency). */
export function ReportTableView({ table, currency, empty = "Nothing to show for this period." }: { table: ReportTable; currency: string; empty?: string }) {
  return (
    <section className="space-y-3">
      <SectionHeading title={table.title} as="h3" />
      {table.rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <Table label={table.title}>
          <THead>
            <tr>
              {table.columns.map((column) => (
                <TH key={column.key} className={column.kind && column.kind !== "text" ? "text-right" : undefined}>{column.label}</TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {table.rows.map((row, index) => (
              <TR key={index}>
                {table.columns.map((column) => (
                  <TD key={column.key} className={column.kind && column.kind !== "text" ? "whitespace-nowrap text-right tabular-nums" : undefined}>
                    {display(column, row[column.key] ?? null, currency)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
