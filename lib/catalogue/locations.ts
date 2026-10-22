import "server-only";

import type { LocationKind } from "@prisma/client";
import { prisma, type DbClient, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { newQrCode } from "./qr";
import { locationSchema } from "./schemas";

type Actor = { userId: string | null };
type Node = { id: string; parentId: string | null; name: string; code: string; kind: LocationKind; archivedAt: Date | null };

/** Every location of a space with its full path ("Main building › Room 2 › Shelf B"). */
export async function locationTree(spaceId: string, client: DbClient = prisma, options: { includeArchived?: boolean } = {}) {
  const rows: Node[] = await client.location.findMany({
    where: { spaceId, ...(options.includeArchived ? {} : { archivedAt: null }) },
    select: { id: true, parentId: true, name: true, code: true, kind: true, archivedAt: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathOf = (row: Node): string[] => {
    const names: string[] = [];
    let current: Node | undefined = row;
    for (let depth = 0; current && depth < 12; depth += 1) {
      names.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return names;
  };
  return rows.map((row) => ({ ...row, path: pathOf(row).join(" › "), depth: pathOf(row).length - 1 }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function assertParent(tx: Tx, spaceId: string, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  let current: string | null = parentId;
  for (let depth = 0; current; depth += 1) {
    if (current === selfId) throw new DomainError("A location can't sit inside itself.", "invalid");
    if (depth > 10) throw new DomainError("Locations can nest at most 10 levels deep.", "invalid");
    const parent: { parentId: string | null; archivedAt: Date | null } | null = await tx.location.findFirst({ where: { id: current, spaceId }, select: { parentId: true, archivedAt: true } });
    if (!parent) notFound("parent location");
    if (parent.archivedAt) throw new DomainError("Choose a parent that isn't archived.", "invalid");
    current = parent.parentId;
  }
}

export async function createLocation(tx: Tx, spaceId: string, raw: unknown, actor: Actor) {
  const input = locationSchema.parse(raw);
  await assertParent(tx, spaceId, input.parentId);
  if (await tx.location.findUnique({ where: { spaceId_code: { spaceId, code: input.code } }, select: { id: true } })) throw new DomainError(`Code ${input.code} is already used.`, "conflict");
  const location = await tx.location.create({ data: { ...input, spaceId, qrCode: newQrCode("location") } });
  await recordAuditEvent({ client: tx, action: "location.created", spaceId, actorId: actor.userId, targetType: "Location", targetId: location.id, metadata: { code: location.code } });
  return location;
}

export async function updateLocation(tx: Tx, spaceId: string, locationId: string, raw: unknown, actor: Actor) {
  const existing = await tx.location.findFirst({ where: { id: locationId, spaceId }, select: { id: true, code: true } });
  if (!existing) notFound("location");
  const input = locationSchema.parse(raw);
  await assertParent(tx, spaceId, input.parentId, locationId);
  if (input.code !== existing.code && (await tx.location.findUnique({ where: { spaceId_code: { spaceId, code: input.code } }, select: { id: true } }))) {
    throw new DomainError(`Code ${input.code} is already used.`, "conflict");
  }
  const location = await tx.location.update({ where: { id: locationId }, data: input });
  await recordAuditEvent({ client: tx, action: "location.updated", spaceId, actorId: actor.userId, targetType: "Location", targetId: locationId, metadata: { code: location.code } });
  return location;
}

/** Archive an empty location: no stock, no assets and no active sub-locations. */
export async function setLocationArchived(tx: Tx, spaceId: string, locationId: string, archived: boolean, actor: Actor) {
  const location = await tx.location.findFirst({ where: { id: locationId, spaceId }, select: { id: true, parentId: true } });
  if (!location) notFound("location");
  if (archived) {
    const [stock, assets, children] = await Promise.all([
      tx.stockLevel.count({ where: { locationId, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] } }),
      tx.asset.count({ where: { locationId, status: { in: ["AVAILABLE", "MAINTENANCE"] } } }),
      tx.location.count({ where: { parentId: locationId, archivedAt: null } }),
    ]);
    if (stock > 0 || assets > 0) throw new DomainError("Move the stock out of this location before archiving it.", "conflict");
    if (children > 0) throw new DomainError("Archive or move the locations inside it first.", "conflict");
  } else if (location.parentId) {
    await assertParent(tx, spaceId, location.parentId);
  }
  await tx.location.update({ where: { id: locationId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAuditEvent({ client: tx, action: archived ? "location.archived" : "location.restored", spaceId, actorId: actor.userId, targetType: "Location", targetId: locationId });
}
