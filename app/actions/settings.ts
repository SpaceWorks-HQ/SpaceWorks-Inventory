"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { hasRoleAtLeast } from "@/lib/roles";
import { changedKeys, isSettingsSection, SETTINGS_SECTIONS } from "@/lib/settings/sections";

/**
 * Save one settings section. Space-manager sections need ADMIN, the
 * inventory section needs MANAGER. Every change is audited with the names
 * of the fields that changed.
 */
export async function updateSettingsSection(slug: string, section: string, input: unknown): Promise<ActionResult> {
  if (!isSettingsSection(section)) return actionError("That settings section doesn't exist.");
  const config = SETTINGS_SECTIONS[section];
  const { ctx, denied } = await spaceAction(slug, (m) => m != null && hasRoleAtLeast(m.role, config.minRole));
  if (denied) return denied;
  const parsed = config.schema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data as Record<string, unknown>;
  const before = ctx.space as unknown as Record<string, unknown>;
  const changed = changedKeys(before, data);
  if (changed.length === 0) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.space.update({ where: { id: ctx.space.id }, data: data as Prisma.SpaceUpdateInput });
    await recordAuditEvent({
      client: tx,
      action: "settings.updated",
      spaceId: ctx.space.id,
      actorId: ctx.user.id,
      targetType: "Space",
      targetId: ctx.space.id,
      metadata: { section, fields: changed.join(",") },
    });
  });
  revalidatePath(`/s/${ctx.space.slug}`, "layout");
  return { ok: true };
}
