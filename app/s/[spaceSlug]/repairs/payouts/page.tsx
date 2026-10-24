import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader, StatTile } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { repairRef } from "@/lib/catalogue/references";
import { prisma } from "@/lib/db";
import { PAYOUT_METHOD_LABEL } from "@/lib/finance/labels";
import { formatDate } from "@/lib/format/datetime";
import { formatMoney } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";

export const metadata: Metadata = { title: "Repair payouts" };

/** Every repair payout (append-only), newest first. Inventory managers only. */
export default async function RepairPayoutsPage({ params }: PageProps<"/s/[spaceSlug]/repairs/payouts">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "MANAGER");
  const [payouts, owed] = await Promise.all([
    prisma.repairPayout.findMany({ where: { spaceId: space.id }, orderBy: { paidAt: "desc" }, take: 500, include: { issue: { select: { id: true, number: true, title: true } }, technician: { select: { name: true } } } }),
    prisma.repairIssue.findMany({ where: { spaceId: space.id, approvedMinor: { gt: 0 }, status: { not: "CANCELLED" } }, select: { approvedMinor: true, payouts: { select: { amountMinor: true } } } }),
  ]);
  const unpaid = owed.reduce((sum, issue) => sum + Math.max(0, (issue.approvedMinor ?? 0) - issue.payouts.reduce((paid, payout) => paid + payout.amountMinor, 0)), 0);
  const total = payouts.reduce((sum, payout) => sum + payout.amountMinor, 0);
  const currency = space.currency;
  const slug = space.slug;

  return (
    <ListLayout header={<PageHeader title="Repair payouts" description="Money paid to technicians. Each payout is also in the finance ledger." />}>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Paid (shown below)" value={formatMoney(total, currency)} />
        <StatTile label="Approved, not paid yet" value={formatMoney(unpaid, currency)} tone={unpaid > 0 ? "attention" : "default"} />
      </div>
      {payouts.length === 0 ? <EmptyState patch title="No payouts yet.">Approve a fixed repair&apos;s amount, then record the payout on the repair.</EmptyState> : (
        <Table label="Repair payouts">
          <THead>
            <tr><TH>Paid</TH><TH>Repair</TH><TH>Technician</TH><TH>Method</TH><TH className="text-right">Amount</TH></tr>
          </THead>
          <TBody>
            {payouts.map((payout) => (
              <TR key={payout.id}>
                <TD className="whitespace-nowrap">{formatDate(payout.paidAt, space.timezone)}</TD>
                <TD className="min-w-[180px]"><Link href={`/s/${slug}/repairs/${payout.issue.id}`} className="font-semibold text-accent-text underline-offset-4 hover:underline">{repairRef(payout.issue.number)}</Link><span className="block text-caption text-ink-muted">{payout.issue.title}</span></TD>
                <TD>{payout.technician.name}</TD>
                <TD className="text-ink-secondary">{PAYOUT_METHOD_LABEL[payout.method]}{payout.reference ? <span className="block text-caption">{payout.reference}</span> : null}</TD>
                <TD className="whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(payout.amountMinor, currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </ListLayout>
  );
}
