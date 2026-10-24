"use server";

import { z } from "zod";
import { revalidatePath } from "@/lib/frontend/cache";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { actionError, validationError, type ActionResult } from "@/lib/actionResult";
import { canManageApiKeys, canManageWebhooks } from "@/lib/roles";
import { idSchema } from "@/lib/validation";
import { generateTokenSecret } from "@/lib/apiTokens";
import { isApiScope, normalizeScopes } from "@/lib/apiTokens/scopes";
import { createEndpoint, deleteEndpoint, retryDelivery, rotateSecret, sendTestEvent, setEndpointEnabled, updateEndpoint } from "@/lib/webhooks";

/**
 * API keys and webhooks (admins). Plain API keys and webhook signing
 * secrets are returned once by create/rotate and never stored or audited.
 */

const MAX_ACTIVE_KEYS = 50;

function revalidate(slug: string) {
  revalidatePath(`/s/${slug}/settings/integrations`);
}

const keySchema = z.object({
  name: z.string().trim().min(1, "Name the key after what uses it.").max(80),
  scopes: z.array(z.string().refine(isApiScope, "Unknown scope.")).min(1, "Pick at least one scope.").max(20),
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365)]).nullable(),
});

export async function createApiKeyAction(slug: string, input: unknown): Promise<ActionResult<{ token: string; prefix: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageApiKeys);
  if (denied) return denied;
  const parsed = keySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const active = await prisma.apiToken.count({ where: { spaceId: ctx.space.id, revokedAt: null } });
  if (active >= MAX_ACTIVE_KEYS) return actionError("This space has too many active keys. Revoke unused ones first.");
  const scopes = normalizeScopes(parsed.data.scopes);
  const secret = generateTokenSecret();
  const expiresAt = parsed.data.expiresInDays ? new Date(Date.now() + parsed.data.expiresInDays * 86_400_000) : null;
  await prisma.$transaction(async (tx) => {
    const token = await tx.apiToken.create({
      data: { spaceId: ctx.space.id, name: parsed.data.name, prefix: secret.prefix, secretHash: secret.secretHash, scopes, expiresAt, createdById: ctx.user.id },
      select: { id: true },
    });
    await recordAuditEvent({ client: tx, action: "api_token.created", spaceId: ctx.space.id, actorId: ctx.user.id, targetType: "ApiToken", targetId: token.id, metadata: { scopes: scopes.join(","), expiresInDays: parsed.data.expiresInDays } });
  });
  revalidate(ctx.space.slug);
  return { ok: true, data: { token: secret.token, prefix: secret.prefix } };
}

export async function revokeApiKeyAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageApiKeys);
  if (denied) return denied;
  const parsed = z.object({ tokenId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const revoked = await prisma.$transaction(async (tx) => {
    const result = await tx.apiToken.updateMany({ where: { id: parsed.data.tokenId, spaceId: ctx.space.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count === 1) await recordAuditEvent({ client: tx, action: "api_token.revoked", spaceId: ctx.space.id, actorId: ctx.user.id, targetType: "ApiToken", targetId: parsed.data.tokenId });
    return result.count;
  });
  if (revoked === 0) return actionError("That key was already revoked.");
  revalidate(ctx.space.slug);
  return { ok: true };
}

const endpointSchema = z.object({ url: z.string().max(500), description: z.string().max(120).optional(), events: z.array(z.string().max(64)).max(64) });
const endpointIdSchema = z.object({ endpointId: idSchema });

export async function createWebhookAction(slug: string, input: unknown): Promise<ActionResult<{ secret: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks);
  if (denied) return denied;
  const parsed = endpointSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { secret } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, parsed.data, { userId: ctx.user.id }));
    revalidate(ctx.space.slug);
    return { ok: true, data: { secret } };
  } catch (error) {
    return domainFailure(error);
  }
}

export async function updateWebhookAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks);
  if (denied) return denied;
  const parsed = endpointSchema.extend({ endpointId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { endpointId, ...rest } = parsed.data;
  try {
    await prisma.$transaction((tx) => updateEndpoint(tx, ctx.space.id, endpointId, rest, { userId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true };
}

export async function setWebhookEnabledAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks);
  if (denied) return denied;
  const parsed = endpointIdSchema.extend({ enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => setEndpointEnabled(tx, ctx.space.id, parsed.data.endpointId, parsed.data.enabled, { userId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true };
}

export async function rotateWebhookSecretAction(slug: string, input: unknown): Promise<ActionResult<{ secret: string }>> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks);
  if (denied) return denied;
  const parsed = endpointIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { secret } = await prisma.$transaction((tx) => rotateSecret(tx, ctx.space.id, parsed.data.endpointId, { userId: ctx.user.id }));
    revalidate(ctx.space.slug);
    return { ok: true, data: { secret } };
  } catch (error) {
    return domainFailure(error);
  }
}

export async function deleteWebhookAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks);
  if (denied) return denied;
  const parsed = endpointIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => deleteEndpoint(tx, ctx.space.id, parsed.data.endpointId, { userId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true };
}

export async function sendWebhookTestAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks, "webhook");
  if (denied) return denied;
  const parsed = endpointIdSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, parsed.data.endpointId, { userId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true };
}

export async function retryWebhookDeliveryAction(slug: string, input: unknown): Promise<ActionResult> {
  const { ctx, denied } = await spaceAction(slug, canManageWebhooks, "webhook");
  if (denied) return denied;
  const parsed = z.object({ deliveryId: idSchema }).safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    await prisma.$transaction((tx) => retryDelivery(tx, ctx.space.id, parsed.data.deliveryId, { userId: ctx.user.id }));
  } catch (error) {
    return domainFailure(error);
  }
  revalidate(ctx.space.slug);
  return { ok: true };
}
