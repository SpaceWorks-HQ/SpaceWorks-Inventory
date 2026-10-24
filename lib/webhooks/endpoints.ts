import "server-only";

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma, type DbClient, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import { DomainError, notFound } from "@/lib/domainError";
import { WEBHOOK_JOB_KIND } from "@/lib/events/emit";
import { webhookUrlProblem } from "@/lib/events/network";
import { newWebhookSecret } from "@/lib/events/signature";
import { endpointInputSchema, MAX_ENDPOINTS_PER_SPACE, urlHost, type EndpointInput } from "./rules";

type Actor = { userId: string | null };

/**
 * Webhook endpoint management for one space. Signing secrets are encrypted
 * at rest and returned in plain text only from create and rotate; audit
 * metadata carries the host, never the URL path or the secret.
 */

function audit(tx: Tx, spaceId: string, actor: Actor, action: string, endpointId: string, metadata?: Record<string, string | number | boolean | null>) {
  return recordAuditEvent({ client: tx, action, spaceId, actorId: actor.userId, targetType: "WebhookEndpoint", targetId: endpointId, metadata });
}

async function findEndpoint(client: DbClient, spaceId: string, endpointId: string) {
  const endpoint = await client.webhookEndpoint.findFirst({ where: { id: endpointId, spaceId } });
  if (!endpoint) notFound("webhook");
  return endpoint;
}

export async function createEndpoint(tx: Tx, spaceId: string, raw: EndpointInput, actor: Actor) {
  const parsed = endpointInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Check the webhook details.", "invalid");
  const input = parsed.data;
  const problem = webhookUrlProblem(input.url);
  if (problem) throw new DomainError(problem, "invalid");
  if ((await tx.webhookEndpoint.count({ where: { spaceId } })) >= MAX_ENDPOINTS_PER_SPACE) {
    throw new DomainError(`A space can have ${MAX_ENDPOINTS_PER_SPACE} webhooks. Delete one you no longer use first.`, "conflict");
  }
  const secret = newWebhookSecret();
  const endpoint = await tx.webhookEndpoint.create({
    data: { spaceId, url: input.url, description: input.description, events: input.events, secretEnc: encryptSecret("webhook-secrets", secret), createdById: actor.userId },
    select: { id: true },
  });
  await audit(tx, spaceId, actor, "webhook.created", endpoint.id, { host: urlHost(input.url), events: input.events.join(",").slice(0, 400) });
  return { id: endpoint.id, secret };
}

export async function updateEndpoint(tx: Tx, spaceId: string, endpointId: string, raw: EndpointInput, actor: Actor) {
  await findEndpoint(tx, spaceId, endpointId);
  const parsed = endpointInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(parsed.error.issues[0]?.message ?? "Check the webhook details.", "invalid");
  const problem = webhookUrlProblem(parsed.data.url);
  if (problem) throw new DomainError(problem, "invalid");
  await tx.webhookEndpoint.update({ where: { id: endpointId }, data: { url: parsed.data.url, description: parsed.data.description, events: parsed.data.events } });
  await audit(tx, spaceId, actor, "webhook.updated", endpointId, { host: urlHost(parsed.data.url), events: parsed.data.events.join(",").slice(0, 400) });
}

/** Switch delivery on or off. Switching on also clears an automatic switch-off and the failure streak. */
export async function setEndpointEnabled(tx: Tx, spaceId: string, endpointId: string, enabled: boolean, actor: Actor) {
  await findEndpoint(tx, spaceId, endpointId);
  await tx.webhookEndpoint.update({ where: { id: endpointId }, data: enabled ? { enabled: true, disabledAt: null, failureCount: 0 } : { enabled: false } });
  await audit(tx, spaceId, actor, enabled ? "webhook.enabled" : "webhook.disabled", endpointId);
}

/** A new signing secret; the old one stops working at once. Returned in plain text this one time. */
export async function rotateSecret(tx: Tx, spaceId: string, endpointId: string, actor: Actor) {
  await findEndpoint(tx, spaceId, endpointId);
  const secret = newWebhookSecret();
  await tx.webhookEndpoint.update({ where: { id: endpointId }, data: { secretEnc: encryptSecret("webhook-secrets", secret) } });
  await audit(tx, spaceId, actor, "webhook.rotated", endpointId);
  return { secret };
}

export async function deleteEndpoint(tx: Tx, spaceId: string, endpointId: string, actor: Actor) {
  const endpoint = await findEndpoint(tx, spaceId, endpointId);
  // Its deliveries cascade; queued outbox jobs find no delivery and finish as done.
  await tx.webhookEndpoint.delete({ where: { id: endpointId } });
  await audit(tx, spaceId, actor, "webhook.deleted", endpointId, { host: urlHost(endpoint.url) });
}

/** Queue a test event to this endpoint, whatever it subscribes to. */
export async function sendTestEvent(tx: Tx, spaceId: string, endpointId: string, actor: Actor, now = new Date()) {
  const endpoint = await findEndpoint(tx, spaceId, endpointId);
  if (!endpoint.enabled || endpoint.disabledAt) throw new DomainError("Switch the webhook on before sending a test.", "conflict");
  const space = await tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { slug: true } });
  const eventId = `evt_${crypto.randomBytes(12).toString("base64url")}`;
  const payload = {
    id: eventId,
    type: "test",
    createdAt: now.toISOString(),
    space: { slug: space.slug },
    data: { message: "A test event from Space Works Inventory." },
  } satisfies Prisma.InputJsonValue;
  const delivery = await tx.webhookDelivery.create({ data: { endpointId, spaceId, eventType: "test", eventId, payload }, select: { id: true } });
  await tx.outboxMessage.create({ data: { kind: WEBHOOK_JOB_KIND, payload: { deliveryId: delivery.id } } });
  await audit(tx, spaceId, actor, "webhook.tested", endpointId);
  return { deliveryId: delivery.id };
}

/** Try a failed delivery again: back to PENDING (attempts kept) with a fresh outbox job. */
export async function retryDelivery(tx: Tx, spaceId: string, deliveryId: string, actor: Actor) {
  const delivery = await tx.webhookDelivery.findFirst({ where: { id: deliveryId, spaceId }, select: { id: true, status: true, endpointId: true, endpoint: { select: { enabled: true, disabledAt: true } } } });
  if (!delivery) notFound("delivery");
  if (delivery.status !== "FAILED") throw new DomainError("Only failed deliveries can be retried.", "conflict");
  if (!delivery.endpoint.enabled || delivery.endpoint.disabledAt) throw new DomainError("Switch the webhook on before retrying.", "conflict");
  await tx.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "PENDING", lastError: null } });
  await tx.outboxMessage.create({ data: { kind: WEBHOOK_JOB_KIND, payload: { deliveryId: delivery.id } } });
  await audit(tx, spaceId, actor, "webhook.retried", delivery.endpointId, { deliveryId: delivery.id });
}

/** Endpoints of a space with their last 20 deliveries (newest first). Never includes the secret. */
export async function listEndpoints(spaceId: string, client: DbClient = prisma) {
  return client.webhookEndpoint.findMany({
    where: { spaceId },
    orderBy: { createdAt: "asc" },
    take: MAX_ENDPOINTS_PER_SPACE,
    select: {
      id: true, url: true, description: true, events: true, enabled: true, disabledAt: true, failureCount: true, lastSuccessAt: true, createdAt: true,
      deliveries: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, eventType: true, status: true, responseStatus: true, attempts: true, lastError: true, createdAt: true, deliveredAt: true },
      },
    },
  });
}
