import Link from "next/link";
import type { AssetStatus } from "@prisma/client";
import { AssetStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CONDITION_LABEL } from "./words";

export type AssetListRow = { id: string; assetTag: string; serialNumber: string | null; status: AssetStatus; condition: keyof typeof CONDITION_LABEL; itemId: string; item: string; location: string | null };

/** Serialized units across the space; the asset tag is the row link. */
export function AssetsTable({ slug, rows }: { slug: string; rows: AssetListRow[] }) {
  return (
    <Table label="Assets">
      <THead>
        <tr><TH>Asset tag</TH><TH>Item</TH><TH>Serial number</TH><TH>Status</TH><TH>Condition</TH><TH>Location</TH></tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD><Link href={`/s/${slug}/assets/${row.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{row.assetTag}</Link></TD>
            <TD className="min-w-40"><Link href={`/s/${slug}/items/${row.itemId}`} className="hover:underline">{row.item}</Link></TD>
            <TD className="text-ink-muted">{row.serialNumber ?? "None"}</TD>
            <TD><AssetStatusChip status={row.status} /></TD>
            <TD>{CONDITION_LABEL[row.condition]}</TD>
            <TD className="text-ink-muted">{row.location ?? "Off the shelf"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
