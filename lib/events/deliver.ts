import "server-only";

import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { isPrivateAddress, privateTargetsAllowed } from "./network";
import { signWebhook } from "./signature";

/** Attempts before a delivery is given up; the outbox spaces them out. */
const MAX_ATTEMPTS = 8;
/** Consecutive failed deliveries after which the endpoint is switched off. */
const DISABLE_AFTER_FAILURES = 25;
const TIMEOUT_MS = 10_000;

export type DeliveryOutcome = { status: "done" } | { status: "retry"; delayMs: number; error: string } | { status: "failed"; error: string };

type PostResult = { status: number } | { error: string };

/**
 * POST with the resolved, checked address pinned for the connection, so a
 * DNS answer cannot change between the check and the request (rebinding).
 */
async function postJson(target: URL, body: string, headers: Record<string, string>): Promise<PostResult> {
  const host = target.hostname.replace(/^\[|\]$/g, "");
  let address: string;
  let family: number;
  try {
    ({ address, family } = await lookup(host));
  } catch {
    return { error: "The webhook host could not be resolved." };
  }
  if (!privateTargetsAllowed() && isPrivateAddress(address)) return { error: "The webhook host resolves to a private address." };
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise((resolve) => {
    const req = send(target, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "content-length": Buffer.byteLength(body).toString() },
      lookup: (_hostname, _options, callback) => callback(null, address, family),
      timeout: TIMEOUT_MS,
    }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ error: error.message === "timeout" ? "The webhook endpoint timed out." : "The webhook endpoint could not be reached." }));
    req.end(body);
  });
}

function retryDelay(attempts: number) {
  return Math.min(6 * 60 * 60_000, 30_000 * 2 ** Math.max(attempts - 1, 0));
}

/** Deliver one webhook. Never throws: the outbox row mirrors the outcome. */
export async function processWebhookDelivery(deliveryId: string, now = new Date()): Promise<DeliveryOutcome> {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, status: true, attempts: true, eventType: true, eventId: true, payload: true, endpoint: { select: { id: true, url: true, secretEnc: true, enabled: true, disabledAt: true, failureCount: true } } },
  });
  if (!delivery || delivery.status !== "PENDING") return { status: "done" };
  const endpoint = delivery.endpoint;
  if (!endpoint.enabled || endpoint.disabledAt) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "The endpoint is switched off." } });
    return { status: "done" };
  }
  const body = JSON.stringify(delivery.payload);
  const timestamp = Math.floor(now.getTime() / 1000);
  const result = await postJson(new URL(endpoint.url), body, {
    "user-agent": "SpaceWorks-Inventory-Webhooks/1",
    "x-spaceworks-event": delivery.eventType,
    "x-spaceworks-delivery": delivery.id,
    "x-spaceworks-signature": signWebhook(decryptSecret("webhook-secrets", endpoint.secretEnc), body, timestamp),
  });
  const attempts = delivery.attempts + 1;
  if ("status" in result && result.status >= 200 && result.status < 300) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "SUCCEEDED", attempts, responseStatus: result.status, deliveredAt: now, lastError: null } }),
      prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { failureCount: 0, lastSuccessAt: now } }),
    ]);
    return { status: "done" };
  }
  const error = "error" in result ? result.error : `The endpoint answered ${result.status}.`;
  const terminal = attempts >= MAX_ATTEMPTS || ("status" in result && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429);
  const failures = endpoint.failureCount + 1;
  await prisma.$transaction([
    prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: terminal ? "FAILED" : "PENDING", attempts, responseStatus: "status" in result ? result.status : null, lastError: error } }),
    prisma.webhookEndpoint.update({ where: { id: endpoint.id }, data: { failureCount: failures, ...(failures >= DISABLE_AFTER_FAILURES ? { disabledAt: now } : {}) } }),
  ]);
  return terminal ? { status: "failed", error } : { status: "retry", delayMs: retryDelay(attempts), error };
}
