import Link from "next/link";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type BalanceRow = { id: string; itemId: string; item: string; sku: string; unit: string | null; location: string; onHand: number; reserved: number; quarantined: number; available: number };

/** One row per item and location: on hand, held, under repair and free. */
export function StockTable({ slug, rows }: { slug: string; rows: BalanceRow[] }) {
  return (
    <Table label="Stock balances">
      <THead>
        <tr>
          <TH>Item</TH>
          <TH>Location</TH>
          <TH className="text-right">On hand</TH>
          <TH className="text-right">Held</TH>
          <TH className="text-right">Under repair</TH>
          <TH className="text-right">Available</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD className="min-w-44">
              <Link href={`/s/${slug}/items/${row.itemId}`} className="font-semibold hover:underline">{row.item}</Link>
              <span className="block text-caption tabular-nums text-ink-muted">{row.sku}</span>
            </TD>
            <TD className="text-ink-muted">{row.location}</TD>
            <TD className="text-right">{row.onHand}{row.unit ? ` ${row.unit}` : ""}</TD>
            <TD className="text-right">{row.reserved}</TD>
            <TD className="text-right">{row.quarantined}</TD>
            <TD className="text-right font-semibold">{row.available}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
