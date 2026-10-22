"use server";

import { revalidatePath } from "@/lib/frontend/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { createInvitation, resendInvitation, revokeInvitation } from "@/lib/invitations";
import { changeMemberRole, removeMember, setMemberStatus } from "@/lib/membership";
import { getSpaceForAction } from "@/lib/permissions";
import { assignableRoles, canManageMembers, canSetMemberAccess } from "@/lib/roles";
import { actionError, NOT_ALLOWED, RATE_LIMITED, validationError, type ActionResult } from "@/lib/actionResult";
import { emailSchema, idSchema, roleSchema } from "@/lib/validation";
import { setBorrowingStatus } from "@/lib/lending/access";

/**
 * Membership mutations (invitations, roles, status, borrowing access). Pattern for every action: resolve the
 * space from the slug server-side → check membership + capability →
 * rate limit → validate → mutate → audit → revalidate.
 */

const slugSchema = z.string().min(1).max(64);

async function context(slug: unknown) {
  const parsed = slugSchema.safeParse(slug);
  if (!parsed.success) return null;
  return getSpaceForAction(parsed.data, "MEMBER");
}

function revalidateSettings(slug: string) {
  revalidatePath(`/s/${slug}`, "layout");
}

const inviteSchema = z.object({ email: emailSchema, role: roleSchema });

export async function createInvitationAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("invite", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  if (!assignableRoles(ctx.membership).includes(parsed.data.role)) return actionError("You can't invite someone with that role.");
  const result = await createInvitation({
    space: ctx.space,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: { id: ctx.user.id, name: ctx.user.name },
  });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

const invitationIdSchema = z.object({ invitationId: idSchema });

export async function resendInvitationAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("invite", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = invitationIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await resendInvitation({ space: ctx.space, invitationId: parsed.data.invitationId, actor: { id: ctx.user.id, name: ctx.user.name } });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

export async function revokeInvitationAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  const parsed = invitationIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await revokeInvitation({ spaceId: ctx.space.id, invitationId: parsed.data.invitationId, actorId: ctx.user.id });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

const memberRoleSchema = z.object({ membershipId: idSchema, role: roleSchema });
const memberStatusSchema = z.object({ membershipId: idSchema, status: z.enum(["ACTIVE", "SUSPENDED"]) });
const memberIdSchema = z.object({ membershipId: idSchema });

export async function changeMemberRoleAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("action", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = memberRoleSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await changeMemberRole({ actor: ctx.membership, ...parsed.data });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

export async function setMemberStatusAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("action", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = memberStatusSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await setMemberStatus({ actor: ctx.membership, ...parsed.data });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

export async function removeMemberAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canManageMembers(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("action", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = memberIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await removeMember({ actor: ctx.membership, membershipId: parsed.data.membershipId });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}

/** Leave a space (any role; the sole owner is blocked). */
export async function leaveSpaceAction(slug: string): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx) return actionError(NOT_ALLOWED);
  const result = await removeMember({ actor: ctx.membership, membershipId: ctx.membership.id });
  if (!result.ok) return actionError(result.error);
  revalidatePath("/", "layout");
  return { ok: true };
}

const borrowingSchema = z.object({
  membershipId: idSchema,
  status: z.enum(["GOOD", "RESTRICTED", "SUSPENDED"]),
  note: z.string().trim().max(300).optional().transform((v) => v || null),
  memberNumber: z.string().trim().max(40).optional().transform((v) => v || null),
});

/** Inventory managers set a member's borrowing standing and membership number. */
export async function setBorrowingAccessAction(slug: string, input: unknown): Promise<ActionResult> {
  const ctx = await context(slug);
  if (!ctx || !canSetMemberAccess(ctx.membership)) return actionError(NOT_ALLOWED);
  if (await isActionRateLimited("action", ctx.user.id)) return actionError(RATE_LIMITED);
  const parsed = borrowingSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const result = await setBorrowingStatus(prisma, { spaceId: ctx.space.id, actorId: ctx.user.id, ...parsed.data });
  if (!result.ok) return actionError(result.error);
  revalidateSettings(ctx.space.slug);
  return { ok: true };
}
