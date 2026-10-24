import "server-only";

import { prisma, type DbClient } from "@/lib/db";

export type NotificationInput = {
  userId: string;
  spaceId?: string | null;
  /** e.g. "task.assigned", "mention", "invite.accepted". */
  kind: string;
  title: string;
  body?: string | null;
  /** App-relative URL to open, e.g. /s/kochi/projects/BOT/tasks/12. */
  url?: string | null;
};

function safeUrl(url: string | null | undefined) {
  return url && url.startsWith("/") && !url.startsWith("//") ? url.slice(0, 500) : null;
}

/**
 * Create in-app notifications (skipping `excludeUserId`, usually the actor).
 * Pass a transaction client to commit them with the change.
 */
export async function createNotifications(inputs: NotificationInput[], options: { client?: DbClient; excludeUserId?: string | null } = {}) {
  const rows = inputs
    .filter((input) => input.userId !== options.excludeUserId)
    .map((input) => ({
      userId: input.userId,
      spaceId: input.spaceId ?? null,
      kind: input.kind.slice(0, 64),
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 1000) ?? null,
      url: safeUrl(input.url),
    }));
  if (rows.length === 0) return 0;
  const result = await (options.client ?? prisma).notification.createMany({ data: rows });
  return result.count;
}

export async function createNotification(input: NotificationInput, options: { client?: DbClient; excludeUserId?: string | null } = {}) {
  return createNotifications([input], options);
}

export async function listNotifications(userId: string, options: { spaceId?: string; unreadOnly?: boolean; take?: number } = {}) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(options.spaceId ? { spaceId: options.spaceId } : {}),
      ...(options.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(options.take ?? 30, 1), 100),
    select: { id: true, kind: true, title: true, body: true, url: true, readAt: true, createdAt: true, spaceId: true },
  });
}

export async function countUnreadNotifications(userId: string, spaceId?: string) {
  return prisma.notification.count({ where: { userId, readAt: null, ...(spaceId ? { spaceId } : {}) } });
}

/** Mark specific notifications (always scoped to the owner) or all of them as read. */
export async function markNotificationsRead(userId: string, ids?: string[]) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids.slice(0, 200) } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}
