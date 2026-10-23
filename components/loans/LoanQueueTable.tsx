import Link from "next/link";
import type { LoanStatus } from "@prisma/client";
import { LoanStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type LoanQueueRow = {
  id: string; reference: string; status: LoanStatus; overdue: boolean; borrowerName: string; borrowerEmail: string;
  items: string; units: number; dateLabel: string; selfCheckout: boolean;
};

/** The desk queue: the reference is the row link; status chips carry a word. */
export function LoanQueueTable({ slug, rows, dateHeading }: { slug: string; rows: LoanQueueRow[]; dateHeading: string }) {
  return (
    <Table label="Loans">
      <THead>
        <TR><TH>Loan</TH><TH>Member</TH><TH>Items</TH><TH className="text-right">Units</TH><TH>{dateHeading}</TH><TH>Status</TH></TR>
      </THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD><Link href={`/s/${slug}/loans/${row.id}`} className="font-semibold text-accent-text hover:underline">{row.reference}</Link></TD>
            <TD><span className="block text-ink">{row.borrowerName}</span>{row.borrowerName !== row.borrowerEmail ? <span className="block text-caption text-ink-muted">{row.borrowerEmail}</span> : null}</TD>
            <TD className="min-w-48 text-ink-secondary">{row.items}{row.selfCheckout ? <span className="block text-caption text-ink-muted">Self-checkout</span> : null}</TD>
            <TD className="text-right">{row.units}</TD>
            <TD className="whitespace-nowrap">{row.dateLabel}</TD>
            <TD><LoanStatusChip status={row.status} overdue={row.overdue} /></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
