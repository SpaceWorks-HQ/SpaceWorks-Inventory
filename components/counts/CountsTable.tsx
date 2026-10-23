import Link from "next/link";
import type { CountStatus } from "@prisma/client";
import { CountStatusChip } from "@/components/inventory/StatusChips";
import { Chip } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type CountRow = { id: string; reference: string; name: string; status: CountStatus; blind: boolean; scope: string; lines: number; counted: number; scans: number; updatedLabel: string };

/** Counts of this space: the reference is the row link. */
export function CountsTable({ slug, rows }: { slug: string; rows: CountRow[] }) {
  return (
    <Table label="Cycle counts">
      <THead>
        <tr>
          <TH>Count</TH>
          <TH>Scope</TH>
          <TH>Status</TH>
          <TH className="text-right">Progress</TH>
          <TH>Updated</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD>
              <Link href={`/s/${slug}/counts/${row.id}`} className="font-semibold text-accent-text hover:underline">{row.reference}</Link>
              <span className="block text-caption text-ink-muted">{row.name}</span>
            </TD>
            <TD className="min-w-48 text-body-ui">
              {row.scope}
              {row.blind ? <span className="ml-2 inline-block align-middle"><Chip tone="neutral" size="sm">Blind</Chip></span> : null}
            </TD>
            <TD><CountStatusChip status={row.status} /></TD>
            <TD className="whitespace-nowrap text-right">
              {row.counted} of {row.lines} counted{row.scans ? <span className="block text-caption text-ink-muted">{row.scans} tags scanned</span> : null}
            </TD>
            <TD className="whitespace-nowrap text-ink-muted">{row.updatedLabel}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
