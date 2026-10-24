import "server-only";

import type { SpaceRole } from "@prisma/client";
import type { DbClient } from "@/lib/db";
import { escapeHtml, renderNotificationEmail } from "@/lib/email/templates";
import { createNotifications } from "@/lib/notifications";
import { enqueueEmail } from "@/lib/outbox";

export type Notice = { kind: string; title: string; body?: string | null; url: string; email?: boolean };

/**
 * In-app notification plus, when `email` is set, a queued email to each
 * recipient. Commits with the caller's transaction. Bodies are plain text
 * (escaped for email) and never contain bearer links.
 */
export async function notifyUsers(client: DbClient, spaceId: string, userIds: string[], notice: Notice, options: { excludeUserId?: string | null } = {}) {
  const recipients = [...new Set(userIds)].filter((id) => id !== options.excludeUserId);
  if (recipients.length === 0) return;
  await createNotifications(recipients.map((userId) => ({ userId, spaceId, kind: notice.kind, title: notice.title, body: notice.body ?? null, url: notice.url })), { client });
  if (!notice.email) return;
  const users = await client.user.findMany({ where: { id: { in: recipients }, disabledAt: null }, select: { email: true } });
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const rendered = renderNotificationEmail({
    title: notice.title,
    bodyHtml: notice.body ? escapeHtml(notice.body) : "",
    actionUrl: `${base}${notice.url}`,
    actionLabel: "Open Space Works Inventory",
  });
  for (const user of users) await enqueueEmail(client, { spaceId, to: user.email, ...rendered });
}

/** Active members of a space with at least one of the given roles. */
export async function staffIds(client: DbClient, spaceId: string, roles: SpaceRole[] = ["MANAGER", "STAFF"]) {
  const rows = await client.membership.findMany({ where: { spaceId, status: "ACTIVE", role: { in: roles } }, select: { userId: true } });
  return rows.map((row) => row.userId);
}
