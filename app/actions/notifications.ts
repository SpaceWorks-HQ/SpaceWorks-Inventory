"use server";

import { revalidatePath } from "@/lib/frontend/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spaceAction } from "@/lib/actionContext";
import { getCurrentUser } from "@/lib/permissions";
import { markNotificationsRead } from "@/lib/notifications";
import { actionError, type ActionResult } from "@/lib/actionResult";

const schema = z.object({ ids: z.array(z.string().min(1).max(64)).max(200).optional() });

/** Mark the caller's own notifications read (all of them when `ids` is omitted). */
export async function markNotificationsReadAction(input: unknown): Promise<ActionResult<{ count: number }>> {
  const user = await getCurrentUser();
  if (!user) return actionError("Sign in again to continue.");
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) return actionError("Couldn't update notifications. Try again.");
  const count = await markNotificationsRead(user.id, parsed.data.ids);
  revalidatePath("/", "layout");
  return { ok: true, data: { count } };
}

/** Mark the caller's notifications in one space read (all of them when `ids` is omitted). Never touches other people's rows. */
export async function markSpaceNotificationsReadAction(slug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  // Everyone with a membership has an inbox, technicians included.
  const { ctx, denied } = await spaceAction(slug, () => true);
  if (denied) return denied;
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) return actionError("Couldn't update notifications. Try again.");
  const result = await prisma.notification.updateMany({
    where: { userId: ctx.user.id, spaceId: ctx.space.id, readAt: null, ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}) },
    data: { readAt: new Date() },
  });
  revalidatePath(`/s/${ctx.space.slug}`, "layout");
  return { ok: true, data: { count: result.count } };
}
