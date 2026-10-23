import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { formatRelativeTime } from "@/lib/format/datetime";
import { listNotifications } from "@/lib/notifications";
import { requireSpace } from "@/lib/permissions";
import { MarkAllReadButton, NotificationList, type NotificationEntry } from "./_components/NotificationList";

export const metadata = { title: "Notifications" };

/** Only app-relative links are followed; anything else is shown without a link. */
function safeLink(url: string | null): string | null {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : null;
}

export default async function NotificationsPage({ params }: PageProps<"/s/[spaceSlug]/notifications">) {
  const { spaceSlug } = await params;
  const { user, space } = await requireSpace(spaceSlug, "MEMBER");
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

  return (
    <ListLayout
      header={
        <PageHeader
          title="Notifications"
          description={unread > 0 ? `${unread} unread in ${space.name}.` : `You're up to date in ${space.name}.`}
          actions={<MarkAllReadButton slug={slug} disabled={unread === 0} />}
        />
      }
    >
      {entries.length === 0 ? (
        <EmptyState patch title="No notifications yet.">Loan updates, approvals and stock alerts show up here.</EmptyState>
      ) : (
        <NotificationList slug={slug} entries={entries} />
      )}
    </ListLayout>
  );
}
