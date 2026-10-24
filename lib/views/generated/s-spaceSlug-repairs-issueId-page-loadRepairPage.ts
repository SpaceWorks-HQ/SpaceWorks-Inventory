// Generated from app/s/[spaceSlug]/repairs/[issueId]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSpace } from "@/lib/permissions";
import { repairDetail, repairViewer } from "@/lib/repairs";
import { CHANNEL_LABEL } from "@/lib/repairs/channels";
import { TIMELINE_WORDS } from "@/lib/repairs/labels";

export async function loadRepairPage({ params }: PageProps<"/s/[spaceSlug]/repairs/[issueId]">) {
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
return viewDto({ space, viewer, repair, technicians, slug, timeline, canWork } as const);
}
