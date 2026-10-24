import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Timeline } from "@/components/desk/Timeline";
import { RepairStatusChip, SeverityChip } from "@/components/repairs/RepairChips";
import { RequestsPanel } from "@/components/repairs/RequestsPanel";
import { MoneyPanel } from "@/components/repairs/MoneyPanel";
import { WorkPanel } from "@/components/repairs/WorkPanel";
import { StatusPanel } from "@/components/repairs/StatusPanel";
import { Callout, Card, CardHeader, DetailList, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { repairDetail, repairViewer } from "@/lib/repairs";
import { CHANNEL_LABEL } from "@/lib/repairs/channels";
import { SEVERITY_LABEL, TIMELINE_WORDS } from "@/lib/repairs/labels";

export const metadata: Metadata = { title: "Repair" };

export default async function RepairPage({ params }: PageProps<"/s/[spaceSlug]/repairs/[issueId]">) {
  const { spaceSlug, issueId } = await params;
  const { space, user, membership } = await requireSpace(spaceSlug, "TECHNICIAN");
  const viewer = await repairViewer(space.id, user, membership);
  const repair = await repairDetail({ id: space.id, slug: space.slug, timezone: space.timezone }, viewer, issueId);
  if (!repair) notFound();
  const technicians = viewer.manage && repair.status === "REPORTED"
    ? await prisma.technician.findMany({ where: { spaceId: space.id, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, skills: true } })
    : [];
  const slug = space.slug;
  const photoUrl = (id: string) => `/api/s/${slug}/repairs/photos/${id}`;
  const timeline = [...repair.timeline].reverse().map((event) => ({
    id: event.id,
    title: `${TIMELINE_WORDS[event.kind] ?? event.kind}${event.technician && event.kind !== "accepted" && event.kind !== "declined" ? `: ${event.technician}` : ""}`,
    detail: [event.channel ? `Sent by ${event.channel.split(",").filter(Boolean).map((channel) => CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL] ?? channel).join(", ")}` : null, event.text].filter(Boolean).join("\n") || null,
    actorName: event.who,
    whenLabel: event.when,
  }));
  const canWork = repair.status === "ASSIGNED" && (repair.mine || viewer.manage) && !viewer.needsMfa;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/repairs`, label: "Repairs" }}
      header={<PageHeader kicker={repair.reference} title={repair.title} description={<span className="flex flex-wrap items-center gap-2"><RepairStatusChip status={repair.status} /><SeverityChip severity={repair.severity} />{repair.outcome === "SCRAPPED" ? <span className="text-caption text-ink-muted">Scrapped</span> : null}</span>} />}
      aside={
        <div className="flex flex-col gap-4">
          {viewer.needsMfa ? <Callout tone="warning" title="Set up an authenticator app first.">Technicians need one to accept or record repairs. <Link href="/account" className="font-semibold underline underline-offset-4">Open your account</Link></Callout> : null}
          <StatusPanel slug={slug} repair={repair} manage={viewer.manage} respond={!viewer.needsMfa} />
          {viewer.manage && (repair.status === "REPORTED" || repair.requests.length > 0) ? <RequestsPanel slug={slug} issueId={repair.id} open={repair.status === "REPORTED"} requests={repair.requests} technicians={technicians} /> : null}
          {repair.money ? <MoneyPanel key={`${repair.money.approvedMinor}-${repair.money.paidMinor}`} slug={slug} currency={space.currency} repair={repair} pay={viewer.pay} /> : null}
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <Card as="section" aria-label="The problem">
          <CardHeader title="The problem" />
          <DetailList
            items={[
              { label: "Item", value: <Link href={`/s/${slug}/items/${repair.item.id}`} className="font-semibold text-accent-text underline-offset-4 hover:underline">{repair.item.name} ({repair.item.sku})</Link> },
              ...(repair.asset ? [{ label: "Asset", value: <Link href={`/s/${slug}/assets/${repair.asset.id}`} className="font-semibold text-accent-text underline-offset-4 hover:underline">{repair.asset.assetTag}</Link> }] : []),
              { label: "Urgency", value: SEVERITY_LABEL[repair.severity] },
              { label: "Reported", value: `${repair.reportedLabel}${repair.reportedBy ? ` by ${repair.reportedBy}` : ""}` },
              { label: "Out of use", value: repair.held ? `${repair.held.quantity}${repair.held.location ? ` at ${repair.held.location}` : ""}` : "No" },
              ...(repair.incidentLoanId && viewer.viewAll ? [{ label: "From a loan", value: <Link href={`/s/${slug}/loans/${repair.incidentLoanId}`} className="font-semibold text-accent-text underline-offset-4 hover:underline">Open the loan</Link> }] : []),
              { label: "Technician", value: repair.technician?.name ?? "Not assigned yet" },
            ]}
          />
          <p className="mt-4 whitespace-pre-line text-body-ui text-ink-secondary">{repair.description}</p>
          {repair.photos.length ? (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Photos">
              {repair.photos.map((photo) => (
                <li key={photo.id}>
                  <a href={photoUrl(photo.id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, membership-checked photo route */}
                    <img src={photoUrl(photo.id)} alt={photo.stage === "FIX" ? "Photo of the fix" : "Photo of the problem"} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
        {repair.fix.remarks || canWork ? (
          <Card as="section" aria-label="The fix">
            <CardHeader title="The fix" description={repair.fix.fixedLabel ? `Marked fixed ${repair.fix.fixedLabel}` : undefined} />
            {repair.fix.remarks ? <p className="whitespace-pre-line text-body-ui text-ink-secondary">{repair.fix.remarks}</p> : null}
            {repair.fix.partsUsed ? <p className="mt-2 text-body-ui text-ink-secondary"><span className="font-semibold text-ink">Parts: </span>{repair.fix.partsUsed}</p> : null}
            {repair.closeNote ? <p className="mt-2 text-body-ui text-ink-secondary"><span className="font-semibold text-ink">Closing note: </span>{repair.closeNote}</p> : null}
            {canWork ? <WorkPanel slug={slug} currency={space.currency} issueId={repair.id} remarks={repair.fix.remarks ?? ""} partsUsed={repair.fix.partsUsed ?? ""} askedMinor={repair.money?.askedMinor ?? null} /> : null}
          </Card>
        ) : null}
        {repair.purchases.length ? (
          <Card as="section" aria-label="Parts on the buy list">
            <CardHeader title="Parts on the buy list" />
            <ul className="flex flex-col gap-1 text-body-ui">{repair.purchases.map((purchase) => <li key={purchase.id}>{purchase.name} · {purchase.status.toLowerCase()}</li>)}</ul>
          </Card>
        ) : null}
        <Timeline entries={timeline} />
      </div>
    </DetailLayout>
  );
}
