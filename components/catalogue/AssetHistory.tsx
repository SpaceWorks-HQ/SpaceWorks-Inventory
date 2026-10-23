import Link from "next/link";
import type { LoanStatus, TransferStatus } from "@prisma/client";
import { LoanStatusChip, TransferStatusChip } from "@/components/inventory/StatusChips";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type AssetLoanRow = { id: string; ref: string; status: LoanStatus; borrower: string; issued: string | null; returned: string | null };
export type AssetTransferRow = { id: string; ref: string; status: TransferStatus; state: string; route: string };

const TRANSFER_UNIT_STATE: Record<string, string> = { ASSIGNED: "Picked", DISPATCHED: "Sent", RECEIVED: "Received", DAMAGED: "Arrived damaged", MISSING: "Missing", RETURNING: "Coming back", RETURNED: "Returned" };

/** Loans this unit went out on. */
export function AssetLoans({ slug, rows }: { slug: string; rows: AssetLoanRow[] }) {
  if (rows.length === 0) return <p className="text-body-ui text-ink-muted">Never lent.</p>;
  return (
    <Table label="Loans">
      <THead><tr><TH>Loan</TH><TH>Borrower</TH><TH>Status</TH><TH>Issued</TH><TH>Back</TH></tr></THead>
      <TBody>
        {rows.map((row) => (
          <TR key={row.id}>
            <TD><Link href={`/s/${slug}/loans/${row.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{row.ref}</Link></TD>
            <TD>{row.borrower}</TD>
            <TD><LoanStatusChip status={row.status} /></TD>
            <TD className="text-ink-muted">{row.issued ?? "Not yet"}</TD>
            <TD className="text-ink-muted">{row.returned ?? "Not yet"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Transfers this unit travelled on. */
export function AssetTransfers({ slug, rows }: { slug: string; rows: AssetTransferRow[] }) {
  if (rows.length === 0) return <p className="text-body-ui text-ink-muted">Never transferred.</p>;
  return (
    <Table label="Transfers">
      <THead><tr><TH>Transfer</TH><TH>Route</TH><TH>Transfer status</TH><TH>This unit</TH></tr></THead>
      <TBody>
        {rows.map((row) => (
          <TR key={`${row.id}:${row.state}`}>
            <TD><Link href={`/s/${slug}/transfers/${row.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{row.ref}</Link></TD>
            <TD className="text-ink-muted">{row.route}</TD>
            <TD><TransferStatusChip status={row.status} /></TD>
            <TD>{TRANSFER_UNIT_STATE[row.state] ?? row.state}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
