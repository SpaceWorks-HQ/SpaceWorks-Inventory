import Link from "next/link";
import type { TransferStatus } from "@prisma/client";
import { TransferStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type TransferRow = { id: string; reference: string; status: TransferStatus; counterpart: string; directionLabel: string; units: number; lineCount: number; dateLabel: string; createdLabel: string };

/** Transfers of this space; the reference is the row link. */
export function TransfersTable({ slug, rows }: { slug: string; rows: TransferRow[] }) {
  return (
    <Table label="Transfers">
      <THead>
        <tr>
          <TH>Transfer</TH>
          <TH>Status</TH>
          <TH>Where</TH>
          <TH className="text-right">Units</TH>
          <TH>Needed or due</TH>
          <TH>Raised</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD>
              <Link href={`/s/${slug}/transfers/${row.id}`} className="font-semibold text-accent-text hover:underline">{row.reference}</Link>
              <span className="block text-caption text-ink-muted">{row.directionLabel}</span>
            </TD>
            <TD><TransferStatusChip status={row.status} /></TD>
            <TD className="min-w-40 text-body-ui">{row.counterpart}</TD>
            <TD className="whitespace-nowrap text-right">
              {row.units}
              <span className="block text-caption text-ink-muted">{row.lineCount === 1 ? "1 item" : `${row.lineCount} items`}</span>
            </TD>
            <TD className="whitespace-nowrap text-ink-muted">{row.dateLabel}</TD>
            <TD className="whitespace-nowrap text-ink-muted">{row.createdLabel}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
