import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type LoanLineRow = {
  id: string; name: string; sku: string; assetTag: string | null; location: string | null;
  requested: number; approved: number; issued: number; returned: number; damaged: number; lost: number; consumed: number; outstanding: number;
};

/** Every line of a loan with its quantities in words-labelled columns. */
export function LoanLinesTable({ lines, showLocation = true }: { lines: LoanLineRow[]; showLocation?: boolean }) {
  return (
    <section aria-label="Items" className="flex min-w-0 flex-col gap-3">
      <h2 className="text-title text-ink">Items</h2>
      <Table label="Loan items">
        <THead>
          <TR>
            <TH>Item</TH>
            {showLocation ? <TH>From</TH> : null}
            <TH className="text-right">Requested</TH>
            <TH className="text-right">Approved</TH>
            <TH className="text-right">Issued</TH>
            <TH className="text-right">Back</TH>
            <TH className="text-right">Damaged</TH>
            <TH className="text-right">Lost</TH>
            <TH className="text-right">Still out</TH>
          </TR>
        </THead>
        <TBody>
          {lines.map((line) => (
            <TR key={line.id}>
              <TD>
                <span className="block text-ink">{line.name}</span>
                <span className="block text-caption text-ink-muted">{line.assetTag ?? line.sku}{line.consumed ? ` · ${line.consumed} used up` : ""}</span>
              </TD>
              {showLocation ? <TD className="text-ink-secondary">{line.location ?? "—"}</TD> : null}
              <TD className="text-right">{line.requested}</TD>
              <TD className="text-right">{line.approved}</TD>
              <TD className="text-right">{line.issued}</TD>
              <TD className="text-right">{line.returned}</TD>
              <TD className="text-right">{line.damaged}</TD>
              <TD className="text-right">{line.lost}</TD>
              <TD className="text-right font-semibold">{line.outstanding}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </section>
  );
}
