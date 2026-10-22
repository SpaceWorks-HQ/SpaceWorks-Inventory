import "server-only";

import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import type { DbClient } from "@/lib/db";
import { endpointWants, type EventData, type EventType } from "./catalogue";

/** Must equal WEBHOOK_JOB_KIND in lib/outbox.ts. */
export const WEBHOOK_JOB_KIND = "webhook.deliver";

/**
 * Record a domain event for every enabled webhook endpoint of the space that
 * subscribes to it. Pass the caller's transaction so the event commits (or
 * rolls back) with the change; the outbox worker delivers it afterwards.
 */
export async function emitEvent(client: DbClient, input: { spaceId: string; type: EventType; data: EventData; now?: Date }) {
  const endpoints = await client.webhookEndpoint.findMany({ where: { spaceId: input.spaceId, enabled: true, disabledAt: null }, select: { id: true, events: true } });
  const targets = endpoints.filter((endpoint) => endpointWants(endpoint.events, input.type));
  if (targets.length === 0) return { eventId: null, deliveries: 0 };
  const space = await client.space.findUnique({ where: { id: input.spaceId }, select: { slug: true } });
  const eventId = `evt_${crypto.randomBytes(12).toString("base64url")}`;
  const payload = {
    id: eventId,
    type: input.type,
    createdAt: (input.now ?? new Date()).toISOString(),
    space: { slug: space?.slug ?? null },
    data: input.data,
  } satisfies Prisma.InputJsonValue;
  for (const endpoint of targets) {
    const delivery = await client.webhookDelivery.create({
      data: { endpointId: endpoint.id, spaceId: input.spaceId, eventType: input.type, eventId, payload },
      select: { id: true },
    });
    await client.outboxMessage.create({ data: { kind: WEBHOOK_JOB_KIND, payload: { deliveryId: delivery.id } } });
  }
  return { eventId, deliveries: targets.length };
}
