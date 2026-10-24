import Link from "next/link";
import type { MovementType } from "@prisma/client";
import { CountStatusChip, TransferStatusChip } from "@/components/inventory/StatusChips";
import { Card, CardHeader, StatTile } from "@/components/ui/display";
import { countRef, loanRef, transferRef } from "@/lib/catalogue/references";
import { formatRelativeTime } from "@/lib/format/datetime";
import { formatQuantity } from "@/lib/format/quantity";
import type { StaffHome as StaffHomeData } from "@/lib/setup/home";

const MOVEMENT_WORD: Record<MovementType, string> = {
  RECEIPT: "Received", ADJUSTMENT: "Adjusted", COUNT: "Counted", ISSUE: "Issued", RETURN: "Returned", TRANSFER_OUT: "Sent out", TRANSFER_IN: "Arrived",
  TRANSFER_RETURN: "Came back", TRANSFER_LOSS: "Lost in transit", MOVE: "Moved", LOSS: "Lost", DAMAGE: "Damaged", REPAIR: "Repaired", WRITE_OFF: "Written off",
  RESERVE: "Held", RELEASE: "Released", IMPORT: "Imported",
};

const linkClass = "font-semibold text-accent-text hover:underline underline-offset-4";

function Queue({ title, empty, href, children }: { title: string; empty: string; href: string; children: React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader title={title} titleAs="h3" action={<Link href={href} className={linkClass}>View all</Link>} className="mb-3" />
      {children.length === 0 ? <p className="text-body-ui text-ink-muted">{empty}</p> : <ul className="divide-y divide-line">{children}</ul>}
    </Card>
  );
}

function Row({ href, reference, detail, meta }: { href: string; reference: string; detail: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <li className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
      <span className="min-w-0">
        <Link href={href} className={`${linkClass} tabular-nums`}>{reference}</Link>
        <span className="ml-2 text-body-ui text-ink-secondary">{detail}</span>
      </span>
      {meta ? <span className="shrink-0 text-caption text-ink-muted">{meta}</span> : null}
    </li>
  );
}

/** Desk view: four stat tiles, the queues that need someone today and the latest stock movements. */
export function StaffHome({ slug, timezone, data }: { slug: string; timezone: string; data: StaffHomeData }) {
  const base = `/s/${slug}`;
  return (
    <div className="space-y-6">
      <section aria-label="Today at the desk" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Requests waiting" value={data.stats.requested} href={`${base}/loans?tab=requests`} />
        <StatTile label="Due back today" value={data.stats.dueToday} href={`${base}/loans?tab=on-loan`} />
        <StatTile label="Overdue" value={data.stats.overdue} tone={data.stats.overdue > 0 ? "attention" : "default"} href={`${base}/loans?tab=overdue`} />
        <StatTile label="Low stock" value={data.stats.lowStock} tone={data.stats.lowStock > 0 ? "attention" : "default"} href={`${base}/purchases`} />
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <Queue title="Loan requests" empty="No requests waiting." href={`${base}/loans?tab=requests`}>
          {data.requests.map((loan) => <Row key={loan.id} href={`${base}/loans/${loan.id}`} reference={loanRef(loan.number)} detail={`${loan.borrower ?? "A member"} · ${loan.items}`} meta={formatRelativeTime(loan.createdAt, timezone)} />)}
        </Queue>
        <Queue title="Ready to collect" empty="Nothing is waiting to be handed over." href={`${base}/loans?tab=ready`}>
          {data.ready.map((loan) => <Row key={loan.id} href={`${base}/loans/${loan.id}`} reference={loanRef(loan.number)} detail={`${loan.borrower ?? "A member"} · ${loan.items}`} />)}
        </Queue>
        <Queue title="Transfers to send" empty="No transfers to approve or dispatch." href={`${base}/transfers`}>
          {data.transfersOut.map((t) => <Row key={t.id} href={`${base}/transfers/${t.id}`} reference={transferRef(t.number)} detail={t.other ? `To ${t.other}` : "Between shelves"} meta={<TransferStatusChip status={t.status} />} />)}
        </Queue>
        <Queue title="Transfers arriving" empty="Nothing on its way in." href={`${base}/transfers`}>
          {data.transfersIn.map((t) => <Row key={t.id} href={`${base}/transfers/${t.id}`} reference={transferRef(t.number)} detail={`From ${t.other}`} meta={<TransferStatusChip status={t.status} />} />)}
        </Queue>
        <Queue title="Open counts" empty="No counts in progress." href={`${base}/counts`}>
          {data.counts.map((c) => <Row key={c.id} href={`${base}/counts/${c.id}`} reference={countRef(c.number)} detail={c.name} meta={<CountStatusChip status={c.status} />} />)}
        </Queue>
        <Queue title="Recent stock movements" empty="No stock has moved yet." href={`${base}/stock`}>
          {data.movements.map((m) => (
            <li key={m.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-body-ui">
                <Link href={`${base}/items/${m.itemId}`} className={linkClass}>{m.itemName}</Link>
                <span className="ml-2 text-ink-secondary">{MOVEMENT_WORD[m.type]}{m.quantity !== 0 ? ` ${m.quantity > 0 ? "+" : "−"}${formatQuantity(Math.abs(m.quantity), m.unit ? { symbol: m.unit } : null)}` : ""}</span>
              </span>
              <span className="shrink-0 text-caption text-ink-muted">{formatRelativeTime(m.createdAt, timezone)}</span>
            </li>
          ))}
        </Queue>
      </div>
    </div>
  );
}
