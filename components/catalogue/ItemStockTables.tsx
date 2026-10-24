import Link from "next/link";
import type { AssetStatus } from "@prisma/client";
import { AssetStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CONDITION_LABEL } from "./words";

export type LevelRow = { locationId: string; location: string; onHand: number; reserved: number; quarantined: number; available: number };
export type ItemAssetRow = { id: string; assetTag: string; serialNumber: string | null; status: AssetStatus; condition: keyof typeof CONDITION_LABEL; location: string | null };

/** Balances per location: on hand, held for loans or transfers, under repair and free. */
export function StockByLocation({ rows, unit }: { rows: LevelRow[]; unit: string | null }) {
  if (rows.length === 0) return <p className="text-body-ui text-ink-muted">Nothing on the shelves yet.</p>;
  return (
    <Table label="Stock by location">
      <THead>
        <tr>
          <TH>Location</TH>
          <TH className="text-right">{unit ? `On hand (${unit})` : "On hand"}</TH>
          <TH className="text-right">Held</TH>
          <TH className="text-right">Under repair</TH>
          <TH className="text-right">Available</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.locationId}>
            <TD>{row.location}</TD>
            <TD className="text-right">{row.onHand}</TD>
            <TD className="text-right">{row.reserved}</TD>
            <TD className="text-right">{row.quarantined}</TD>
            <TD className="text-right font-semibold">{row.available}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Every physical unit of a serialized item. */
export function ItemAssetsTable({ slug, rows }: { slug: string; rows: ItemAssetRow[] }) {
  if (rows.length === 0) return <p className="text-body-ui text-ink-muted">No units registered yet.</p>;
  return (
    <Table label="Assets">
      <THead>
        <tr>
          <TH>Asset tag</TH>
          <TH>Serial number</TH>
          <TH>Status</TH>
          <TH>Condition</TH>
          <TH>Location</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD><Link href={`/s/${slug}/assets/${row.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{row.assetTag}</Link></TD>
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
