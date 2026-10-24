// Generated from app/s/[spaceSlug]/notifications/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { formatRelativeTime } from "@/lib/format/datetime";
import { listNotifications } from "@/lib/notifications";
import { requireSpace } from "@/lib/permissions";
import { type NotificationEntry } from "@/app/s/[spaceSlug]/notifications/_components/NotificationList";
function safeLink(url: string | null): string | null {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : null;
}
export async function loadNotificationsPage({ params }: PageProps<"/s/[spaceSlug]/notifications">) {
const { spaceSlug } = await params;
const { user, space } = await requireSpace(spaceSlug, "TECHNICIAN");
const rows = await listNotifications(user.id, { spaceId: space.id, take: 100 });
const now = new Date();
const entries: NotificationEntry[] = rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      url: safeLink(row.url),
      when: formatRelativeTime(row.createdAt, space.timezone, now),
      whenIso: row.createdAt.toISOString(),
      unread: row.readAt === null,
    }))
    .sort((a, b) => Number(b.unread) - Number(a.unread));
const unread = entries.filter((entry) => entry.unread).length;
const slug = space.slug;
return viewDto({ space, entries, unread, slug } as const);
}
