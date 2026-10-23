import Link from "next/link";
import type { LoanStatus } from "@prisma/client";
import { LoanStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type MyLoanRow = { id: string; reference: string; status: LoanStatus; overdue: boolean; items: string; out: number; dateLabel: string };

/** A member's own loans; the reference opens the loan. */
export function MyLoansTable({ slug, rows, label }: { slug: string; rows: MyLoanRow[]; label: string }) {
  return (
    <Table label={label}>
      <THead><TR><TH>Loan</TH><TH>Items</TH><TH className="text-right">Still out</TH><TH>When</TH><TH>Status</TH></TR></THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD><Link href={`/s/${slug}/my-loans/${row.id}`} className="font-semibold text-accent-text hover:underline">{row.reference}</Link></TD>
            <TD className="min-w-48 text-ink-secondary">{row.items}</TD>
            <TD className="text-right">{row.out}</TD>
            <TD className="whitespace-nowrap">{row.dateLabel}</TD>
            <TD><LoanStatusChip status={row.status} overdue={row.overdue} /></TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
