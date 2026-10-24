import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError, notFound } from "@/lib/domainError";
import { newQrCode } from "./qr";
import { containerCode } from "./references";
import { kitSchema } from "./schemas";

type Actor = { userId: string | null };

/** A kit is a named bundle members can request in one go. */
export async function saveKit(tx: Tx, spaceId: string, kitId: string | null, raw: unknown, actor: Actor) {
  const input = kitSchema.parse(raw);
  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];
  if (itemIds.length !== input.lines.length) throw new DomainError("List each item once with its quantity.", "invalid");
  const found = await tx.item.count({ where: { id: { in: itemIds }, spaceId, archivedAt: null } });
  if (found !== itemIds.length) notFound("item");
  const clash = await tx.kit.findFirst({ where: { spaceId, name: input.name, ...(kitId ? { NOT: { id: kitId } } : {}) }, select: { id: true } });
  if (clash) throw new DomainError("A kit with that name already exists.", "conflict");
  if (kitId && !(await tx.kit.findFirst({ where: { id: kitId, spaceId }, select: { id: true } }))) notFound("kit");
  const data = { name: input.name, description: input.description, lendable: input.lendable };
  const kit = kitId
    ? await tx.kit.update({ where: { id: kitId }, data: { ...data, lines: { deleteMany: {}, create: input.lines } } })
    : await tx.kit.create({ data: { ...data, spaceId, qrCode: newQrCode("kit"), lines: { create: input.lines } } });
  await recordAuditEvent({ client: tx, action: kitId ? "kit.updated" : "kit.created", spaceId, actorId: actor.userId, targetType: "Kit", targetId: kit.id });
  return kit;
}

export async function setKitArchived(tx: Tx, spaceId: string, kitId: string, archived: boolean, actor: Actor) {
  const updated = await tx.kit.updateMany({ where: { id: kitId, spaceId }, data: { archivedAt: archived ? new Date() : null } });
  if (updated.count !== 1) notFound("kit");
  await recordAuditEvent({ client: tx, action: archived ? "kit.archived" : "kit.restored", spaceId, actorId: actor.userId, targetType: "Kit", targetId: kitId });
}

/** Containers are reusable QR-labelled bags or boxes that loans are packed into. */
export async function createContainers(tx: Tx, spaceId: string, input: { count: number; name: string | null }, actor: Actor) {
  if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 100) throw new DomainError("Create between 1 and 100 containers at a time.", "invalid");
  const created = [];
  for (let index = 0; index < input.count; index += 1) {
    const number = await nextSpaceSequence(tx, spaceId, "container");
    created.push(await tx.container.create({ data: { spaceId, code: containerCode(number), qrCode: newQrCode("container"), name: input.name } }));
  }
  await recordAuditEvent({ client: tx, action: "container.created", spaceId, actorId: actor.userId, targetType: "Container", targetId: created[0]!.id, metadata: { count: created.length } });
  return created;
}

export async function setContainerArchived(tx: Tx, spaceId: string, containerId: string, archived: boolean, actor: Actor) {
  const container = await tx.container.findFirst({ where: { id: containerId, spaceId }, select: { id: true, loans: { where: { status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } }, select: { id: true } } } });
  if (!container) notFound("container");
  if (archived && container.loans.length > 0) throw new DomainError("This container is out on a loan.", "conflict");
  await tx.container.update({ where: { id: containerId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAuditEvent({ client: tx, action: archived ? "container.archived" : "container.restored", spaceId, actorId: actor.userId, targetType: "Container", targetId: containerId });
}
