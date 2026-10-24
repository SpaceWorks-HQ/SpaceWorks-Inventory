import type { Metadata } from "next";
import Link from "next/link";
import { RepairStatusChip, SeverityChip, PayoutChip, RequestChip } from "@/components/repairs/RepairChips";
import { buttonClasses } from "@/components/ui/button";
import { Callout, EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { NavTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format/money";
import { requireSpace } from "@/lib/permissions";
import { listRepairs, repairFilter, repairViewer, REPAIR_FILTERS } from "@/lib/repairs";
import { canReportRepairs } from "@/lib/roles";

export const metadata: Metadata = { title: "Repairs" };

export default async function RepairsPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/repairs">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  const { space, user, membership } = await requireSpace(spaceSlug, "TECHNICIAN");
  const viewer = await repairViewer(space.id, user, membership);
  const filter = repairFilter(query.status);
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 80) : "";
  const { rows, counts } = await listRepairs({ id: space.id, timezone: space.timezone }, viewer, filter, q);
  const base = `/s/${space.slug}/repairs`;
  const tabs = REPAIR_FILTERS.map((entry) => ({ href: entry.key === "open" ? base : `${base}?status=${entry.key}`, label: `${entry.label} (${counts[entry.key] ?? 0})`, active: entry.key === filter.key }));
  const canReport = canReportRepairs(membership);
  const currency = space.currency;
  const description = viewer.viewAll
    ? "Damaged and broken items and assets, from report to verified fix. Send each one to the technicians who can fix it."
    : viewer.technicianId ? "The repairs you were asked to take, and the ones you are working on." : "Problems you reported and how they are going.";

  return (
    <ListLayout
      header={
        <PageHeader
          title="Repairs"
          description={description}
          actions={
            <div className="flex flex-wrap gap-2">
              {viewer.manage ? <Link href={`${base}/technicians`} className={buttonClasses({ variant: "secondary" })}>Technicians</Link> : null}
              {viewer.pay ? <Link href={`${base}/payouts`} className={buttonClasses({ variant: "secondary" })}>Payouts</Link> : null}
              {canReport ? <Link href={`${base}/new`} className={buttonClasses({ variant: "primary" })}>Report a problem</Link> : null}
            </div>
          }
        />
      }
      toolbar={<NavTabs label="Filter repairs" items={tabs} />}
    >
      {viewer.needsMfa ? <Callout tone="warning" title="Set up an authenticator app to work on repairs.">Technicians need one before they can accept or record work. <Link href="/account" className="font-semibold underline underline-offset-4">Open security settings</Link></Callout> : null}
      {rows.length === 0 ? (
        <EmptyState patch title={`No ${filter.label.toLowerCase()} repairs.`}>{canReport ? "Report a problem when something is damaged or broken." : "Requests sent to you show up here."}</EmptyState>
      ) : (
        <Table label="Repairs">
          <THead>
            <tr>
              <TH>Repair</TH>
              <TH>Item</TH>
              <TH>Status</TH>
              <TH>Technician</TH>
              {rows.some((row) => row.money) ? <TH className="text-right">Amount</TH> : null}
              <TH>Reported</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="whitespace-nowrap">
                  <Link href={`${base}/${row.id}`} className="inline-flex min-h-11 items-center font-semibold tabular-nums text-accent-text underline-offset-4 hover:underline">{row.reference}</Link>
                </TD>
                <TD className="min-w-[200px]">
                  <span className="block font-semibold">{row.title}</span>
                  <span className="block text-caption text-ink-muted">{[row.item, row.assetTag].filter(Boolean).join(" · ")}</span>
                  <span className="mt-1 block"><SeverityChip severity={row.severity} /></span>
                </TD>
                <TD>
                  <span className="flex flex-col items-start gap-1">
                    <RepairStatusChip status={row.status} />
                    {row.myRequest ? <RequestChip status={row.myRequest} /> : null}
                    {viewer.manage && row.status === "REPORTED" && row.waitingOn > 0 ? <span className="text-caption text-ink-muted">Waiting on {row.waitingOn} {row.waitingOn === 1 ? "answer" : "answers"}</span> : null}
                  </span>
                </TD>
                <TD className="text-ink-secondary">{row.technician ?? "—"}</TD>
                {rows.some((entry) => entry.money) ? (
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {row.money ? (
                      <span className="flex flex-col items-end gap-1">
                        <span>{row.money.approvedMinor !== null ? formatMoney(row.money.approvedMinor, currency) : row.money.askedMinor !== null ? `${formatMoney(row.money.askedMinor, currency)} asked` : "—"}</span>
                        <PayoutChip state={row.money.payout} />
                      </span>
                    ) : null}
                  </TD>
                ) : null}
                <TD className="whitespace-nowrap text-ink-muted">{row.reportedLabel}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </ListLayout>
  );
}
