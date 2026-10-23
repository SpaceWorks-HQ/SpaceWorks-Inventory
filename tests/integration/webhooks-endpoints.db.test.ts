import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { WEBHOOK_JOB_KIND } from "@/lib/events/emit";
import { createEndpoint, deleteEndpoint, listEndpoints, retryDelivery, rotateSecret, sendTestEvent, setEndpointEnabled } from "@/lib/webhooks";
import { cleanup, createSpace, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let otherSlug = "";
let otherSpaceId = "";

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  const outsider = await createUser(`outsider${ctx.domain}`, "Outsider");
  const other = await createSpace(`other-${suffix}`, outsider.id);
  otherSlug = other.slug;
  otherSpaceId = other.id;
});
afterAll(async () => { await cleanup([ctx.space.slug, otherSlug], ctx.domain); });

const actor = () => ({ userId: ctx.owner.id });
const outboxFor = (deliveryId: string) => prisma.outboxMessage.count({ where: { kind: WEBHOOK_JOB_KIND, payload: { path: ["deliveryId"], equals: deliveryId } } });

describe("webhook endpoints", () => {
  it("stores the signing secret encrypted and returns it once", async () => {
    const { id, secret } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://hooks.example.org/space?key=1", description: "Till", events: ["loan.issued", "stock.low"] }, actor()));
    expect(secret).toMatch(/^whsec_/);
    const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } });
    expect(row.secretEnc).not.toContain(secret);
    expect(decryptSecret("webhook-secrets", row.secretEnc)).toBe(secret);
    expect(row.events).toEqual(["loan.issued", "stock.low"]);
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { spaceId: ctx.space.id, action: "webhook.created", targetId: id } });
    expect(JSON.stringify(audit.metadata)).not.toContain(secret);
    expect(JSON.stringify(audit.metadata)).not.toContain("key=1");
  });

  it("refuses private addresses and malformed subscriptions", async () => {
    await expect(prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "http://localhost:3000/hook", events: ["*"] }, actor()))).rejects.toThrow(/public addresses/);
    await expect(prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://10.0.0.5/hook", events: ["*"] }, actor()))).rejects.toThrow(/public addresses/);
    await expect(prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/hook", events: ["nope"] }, actor()))).rejects.toThrow(/Unknown event/);
  });

  it("queues a test delivery even for events the endpoint does not subscribe to", async () => {
    const { id } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/test", events: ["item.created"] }, actor()));
    const { deliveryId } = await prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, id, actor()));
    const delivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(delivery).toMatchObject({ status: "PENDING", eventType: "test", spaceId: ctx.space.id, endpointId: id });
    expect((delivery.payload as { space: { slug: string } }).space.slug).toBe(ctx.space.slug);
    expect(await outboxFor(deliveryId)).toBe(1);
    expect(await prisma.auditEvent.count({ where: { action: "webhook.tested", targetId: id } })).toBe(1);
  });

  it("rotates the secret so the old one stops working", async () => {
    const { id, secret } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/rotate", events: ["*"] }, actor()));
    const rotated = await prisma.$transaction((tx) => rotateSecret(tx, ctx.space.id, id, actor()));
    expect(rotated.secret).not.toBe(secret);
    const row = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } });
    expect(decryptSecret("webhook-secrets", row.secretEnc)).toBe(rotated.secret);
    expect(await prisma.auditEvent.count({ where: { action: "webhook.rotated", targetId: id } })).toBe(1);
  });

  it("retries only failed deliveries, keeping the attempt count", async () => {
    const { id } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/retry", events: ["*"] }, actor()));
    const { deliveryId } = await prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, id, actor()));
    await expect(prisma.$transaction((tx) => retryDelivery(tx, ctx.space.id, deliveryId, actor()))).rejects.toThrow(/Only failed/);
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "FAILED", attempts: 8, lastError: "The endpoint answered 500." } });
    await prisma.$transaction((tx) => retryDelivery(tx, ctx.space.id, deliveryId, actor()));
    expect(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).toMatchObject({ status: "PENDING", attempts: 8, lastError: null });
    expect(await outboxFor(deliveryId)).toBe(2);
  });

  it("switching on clears an automatic switch-off and the failure streak", async () => {
    const { id } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/trip", events: ["*"] }, actor()));
    await prisma.webhookEndpoint.update({ where: { id }, data: { disabledAt: new Date(), failureCount: 25 } });
    await prisma.$transaction((tx) => setEndpointEnabled(tx, ctx.space.id, id, true, actor()));
    expect(await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id } })).toMatchObject({ enabled: true, disabledAt: null, failureCount: 0 });
    await prisma.$transaction((tx) => setEndpointEnabled(tx, ctx.space.id, id, false, actor()));
    await expect(prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, id, actor()))).rejects.toThrow(/Switch the webhook on/);
  });

  it("never reaches another space's endpoints or deliveries", async () => {
    const { id } = await prisma.$transaction((tx) => createEndpoint(tx, otherSpaceId, { url: "https://example.org/other", events: ["*"] }, { userId: null }));
    const { deliveryId } = await prisma.$transaction((tx) => sendTestEvent(tx, otherSpaceId, id, { userId: null }));
    await prisma.webhookDelivery.update({ where: { id: deliveryId }, data: { status: "FAILED" } });
    await expect(prisma.$transaction((tx) => rotateSecret(tx, ctx.space.id, id, actor()))).rejects.toThrow(/wasn't found/);
    await expect(prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, id, actor()))).rejects.toThrow(/wasn't found/);
    await expect(prisma.$transaction((tx) => deleteEndpoint(tx, ctx.space.id, id, actor()))).rejects.toThrow(/wasn't found/);
    await expect(prisma.$transaction((tx) => retryDelivery(tx, ctx.space.id, deliveryId, actor()))).rejects.toThrow(/wasn't found/);
    expect((await listEndpoints(ctx.space.id)).some((endpoint) => endpoint.id === id)).toBe(false);
  });

  it("deletes an endpoint with its deliveries and audits it", async () => {
    const { id } = await prisma.$transaction((tx) => createEndpoint(tx, ctx.space.id, { url: "https://example.org/delete", events: ["*"] }, actor()));
    await prisma.$transaction((tx) => sendTestEvent(tx, ctx.space.id, id, actor()));
    await prisma.$transaction((tx) => deleteEndpoint(tx, ctx.space.id, id, actor()));
    expect(await prisma.webhookEndpoint.count({ where: { id } })).toBe(0);
    expect(await prisma.webhookDelivery.count({ where: { endpointId: id } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { action: "webhook.deleted", targetId: id } })).toBe(1);
  });
});
