// Generated from app/s/[spaceSlug]/counts/[countId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { countFormOptions } from "@/lib/desk/counts";
import { countDetail } from "@/lib/desk/countsDetail";
import { groupByLocation } from "@/lib/desk/countsLogic";
import { formatDayTime } from "@/lib/format/datetime";
import { perfectCount } from "@/lib/desk/eggs";
import { canCountStock, canManageCounts, requireSpace } from "@/lib/permissions";
function notice(count: { status: string; blind: boolean; threshold: number | null; fourEyes: { blocked: boolean }; totals: { stale: number } }, canManage: boolean) {
  if (count.fourEyes.blocked && canManage) return { tone: "warning" as const, title: "Someone else must post this count", text: `You started or counted it, and some differences are larger than ${count.threshold ?? 0}. Ask another manager who didn't count it to post.` };
  if (count.totals.stale > 0 && (count.status === "IN_PROGRESS" || count.status === "SUBMITTED")) return { tone: "warning" as const, title: `Stock moved on ${count.totals.stale} ${count.totals.stale === 1 ? "line" : "lines"}`, text: "Items were issued, received or moved since the count started. Refresh those lines and count them again before posting." };
  if (count.blind && count.status === "IN_PROGRESS") return { tone: "info" as const, title: "Blind count", text: "Expected quantities stay hidden until the count is submitted. Count what you see." };
  return null;
}
export async function loadCountPage({ params }: PageProps<"/s/[spaceSlug]/counts/[countId]">) {
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
const perfect = perfectCount({ status: count.status, lines });
return viewDto({ count, canCount, canManage, editable, locations, items, slug, groups, showVariances, callout, facts, header, lines, perfect } as const);
}
