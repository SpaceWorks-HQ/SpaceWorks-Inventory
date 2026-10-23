import { notFound } from "next/navigation";
import { AddLineDialog } from "@/components/counts/AddLineDialog";
import { CountActions } from "@/components/counts/CountActions";
import { CountSheet } from "@/components/counts/CountSheet";
import { ScanCountCard } from "@/components/counts/ScanCountCard";
import { VarianceTable } from "@/components/counts/VarianceTable";
import { CountStatusChip } from "@/components/inventory/StatusChips";
import { Callout, Card, DetailList, PageHeader } from "@/components/ui/display";
import { DetailLayout } from "@/components/ui/layouts";
import { countFormOptions } from "@/lib/desk/counts";
import { countDetail } from "@/lib/desk/countsDetail";
import { groupByLocation } from "@/lib/desk/countsLogic";
import { formatDayTime } from "@/lib/format/datetime";
import { canCountStock, canManageCounts, requireSpace } from "@/lib/permissions";

function notice(count: { status: string; blind: boolean; threshold: number | null; fourEyes: { blocked: boolean }; totals: { stale: number } }, canManage: boolean) {
  if (count.fourEyes.blocked && canManage) return { tone: "warning" as const, title: "Someone else must post this count", text: `You started or counted it, and some differences are larger than ${count.threshold ?? 0}. Ask another manager who didn't count it to post.` };
  if (count.totals.stale > 0 && (count.status === "IN_PROGRESS" || count.status === "SUBMITTED")) return { tone: "warning" as const, title: `Stock moved on ${count.totals.stale} ${count.totals.stale === 1 ? "line" : "lines"}`, text: "Items were issued, received or moved since the count started. Refresh those lines and count them again before posting." };
  if (count.blind && count.status === "IN_PROGRESS") return { tone: "info" as const, title: "Blind count", text: "Expected quantities stay hidden until the count is submitted. Count what you see." };
  return null;
}

export default async function CountPage({ params }: PageProps<"/s/[spaceSlug]/counts/[countId]">) {
  const { spaceSlug, countId } = await params;
  const { space, membership, user } = await requireSpace(spaceSlug, "STAFF");
  const count = await countDetail(space.id, countId, user.id);
  if (!count) notFound();
  const canCount = canCountStock(membership);
  const canManage = canManageCounts(membership);
  const editable = count.status === "IN_PROGRESS" && canCount;
  const options = editable ? await countFormOptions(space.id) : { locations: [], categories: [], items: [] };
  const locations = options.locations;
  const items = options.items;
  const slug = space.slug;
  const groups = groupByLocation(count.lines);
  const showVariances = count.showsExpected && count.status !== "IN_PROGRESS";
  const callout = notice(count, canManage);
  const facts = [
    { label: "Scope", value: count.scope },
    { label: "Progress", value: `${count.totals.counted} of ${count.totals.lines} lines counted` },
    { label: "Started", value: `${formatDayTime(count.createdAt, space.timezone)} by ${count.startedBy}` },
    ...(count.submittedAt ? [{ label: "Submitted", value: formatDayTime(count.submittedAt, space.timezone) }] : []),
    ...(count.postedAt ? [{ label: "Posted", value: `${formatDayTime(count.postedAt, space.timezone)} by ${count.postedBy ?? "Someone"}` }] : []),
  ];
  const header = { reference: count.reference, name: count.name, status: count.status, blind: count.blind, threshold: count.threshold, blocked: count.fourEyes.blocked, stale: count.totals.stale };
  const lines = count.lines;

  return (
    <DetailLayout
      back={{ href: `/s/${slug}/counts`, label: "Back to counts" }}
      header={<PageHeader kicker={header.reference} title={header.name} description={header.blind ? "Blind cycle count" : "Cycle count"} actions={<CountStatusChip status={header.status} />} />}
      aside={<Card><DetailList items={facts} /></Card>}
    >
      <div className="flex flex-col gap-6">
        {callout ? <Callout tone={callout.tone} title={callout.title}>{callout.text}</Callout> : null}
        <CountActions slug={slug} countId={countId} status={header.status} canCount={canCount} canManage={canManage} blocked={header.blocked} staleLines={header.stale} recordedLines={count.totals.counted} missingTools={count.missingTools} />
        {showVariances ? <VarianceTable lines={lines} threshold={header.threshold} /> : null}
        {editable ? <ScanCountCard slug={slug} countId={countId} locations={locations} /> : null}
        <CountSheet slug={slug} countId={countId} groups={groups} editable={editable} />
        {editable ? <div><AddLineDialog slug={slug} countId={countId} items={items} locations={locations} /></div> : null}
      </div>
    </DetailLayout>
  );
}
