import Link from "next/link";
import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ItemThumb } from "./ItemThumb";

export type ItemListRow = {
  id: string; name: string; sku: string; tracking: "QUANTITY" | "SERIALIZED"; lendable: boolean; archived: boolean; low: boolean;
  category: string | null; unit: string | null; imageUrl: string | null;
  onHand: number; available: number; onLoan: number; inTransit: number; value: string;
};

const qty = (value: number, unit: string | null) => `${value.toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`;

/** The catalogue with stock in every state and its value at average cost. */
export function ItemsTable({ slug, rows }: { slug: string; rows: ItemListRow[] }) {
  return (
    <Table label="Items">
      <THead>
        <tr>
          <TH>Item</TH>
          <TH>Category</TH>
          <TH className="text-right">On hand</TH>
          <TH className="text-right">Available</TH>
          <TH className="text-right">On loan</TH>
          <TH className="text-right">In transit</TH>
          <TH className="text-right">Value</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD className="min-w-64">
              <div className="flex items-center gap-3">
                <ItemThumb name={row.name} src={row.imageUrl} size="sm" />
                <div className="min-w-0">
                  <Link href={`/s/${slug}/items/${row.id}`} className="font-semibold text-ink hover:underline">{row.name}</Link>
                  <div className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
                    <span className="tabular-nums">{row.sku}</span>
                    {row.tracking === "SERIALIZED" ? <Chip size="sm" tone="info">Serialized</Chip> : null}
                    {row.lendable ? <Chip size="sm" tone="accent">Lendable</Chip> : null}
                    {row.low ? <Chip size="sm" tone="warning">Low stock</Chip> : null}
                    {row.archived ? <Chip size="sm" tone="outline">Archived</Chip> : null}
                  </div>
                </div>
              </div>
            </TD>
            <TD className="text-ink-muted">{row.category ?? "None"}</TD>
            <TD className="text-right tabular-nums">{qty(row.onHand, row.unit)}</TD>
            <TD className="text-right tabular-nums">{qty(row.available, row.unit)}</TD>
            <TD className="text-right tabular-nums">{qty(row.onLoan, row.unit)}</TD>
            <TD className="text-right tabular-nums">{qty(row.inTransit, row.unit)}</TD>
            <TD className="text-right tabular-nums">{row.value}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
