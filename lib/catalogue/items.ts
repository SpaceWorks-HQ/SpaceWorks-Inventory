import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { checkLowStock } from "@/lib/inventory/availability";
import { newQrCode } from "./qr";
import { itemSchema, type ItemInput } from "./schemas";

type Actor = { userId: string | null; apiTokenId?: string | null };

async function assertRefs(tx: Tx, spaceId: string, input: { categoryId: string | null; unitId: string | null; supplierId: string | null }) {
  if (input.categoryId && !(await tx.category.findFirst({ where: { id: input.categoryId, spaceId }, select: { id: true } }))) notFound("category");
  if (input.unitId && !(await tx.unit.findFirst({ where: { id: input.unitId, spaceId }, select: { id: true } }))) notFound("unit");
  if (input.supplierId && !(await tx.supplier.findFirst({ where: { id: input.supplierId, spaceId }, select: { id: true } }))) notFound("supplier");
}

/** SKU from the name when none is given: "Soldering iron" → "SOLDERING-IRON", "-2" on a clash. */
async function uniqueSku(tx: Tx, spaceId: string, wanted: string | null, name: string) {
  const base = (wanted ?? name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32)) || "ITEM";
  if (wanted) {
    if (await tx.item.findUnique({ where: { spaceId_sku: { spaceId, sku: wanted } }, select: { id: true } })) throw new DomainError(`SKU ${wanted} is already used.`, "conflict");
    return wanted;
  }
  for (let n = 1; n < 1000; n += 1) {
    const sku = n === 1 ? base : `${base}-${n}`;
    if (!(await tx.item.findUnique({ where: { spaceId_sku: { spaceId, sku } }, select: { id: true } }))) return sku;
  }
  throw new DomainError("Couldn't pick a free SKU. Enter one.", "conflict");
}

export async function createItem(tx: Tx, spaceId: string, raw: ItemInput, actor: Actor) {
  const input = itemSchema.parse(raw);
  await assertRefs(tx, spaceId, input);
  const space = await tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { defaultReorderPoint: true } });
  const sku = await uniqueSku(tx, spaceId, input.sku, input.name);
  const item = await tx.item.create({
    data: {
      ...input,
      sku,
      spaceId,
      qrCode: newQrCode("item"),
      avgCostMinor: input.unitCostMinor,
      reorderPoint: input.reorderPoint ?? space.defaultReorderPoint,
      selfCheckout: input.lendable && input.selfCheckout,
    },
  });
  await recordAuditEvent({ client: tx, action: "item.created", spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Item", targetId: item.id, metadata: { sku: item.sku, tracking: item.tracking } });
  await emitEvent(tx, { spaceId, type: "item.created", data: { itemId: item.id, sku: item.sku, name: item.name, tracking: item.tracking } });
  return item;
}

export async function updateItem(tx: Tx, spaceId: string, itemId: string, raw: ItemInput, actor: Actor) {
  const existing = await tx.item.findFirst({ where: { id: itemId, spaceId } });
  if (!existing) notFound("item");
  const input = itemSchema.parse(raw);
  await assertRefs(tx, spaceId, input);
  if (input.tracking !== existing.tracking) {
    const hasStock = await tx.stockMovement.count({ where: { itemId } });
    if (hasStock > 0) throw new DomainError("Tracking can't change once the item has stock history. Create a new item instead.", "conflict");
  }
  const sku = input.sku && input.sku !== existing.sku ? await uniqueSku(tx, spaceId, input.sku, input.name) : existing.sku;
  const data: Prisma.ItemUncheckedUpdateInput = { ...input, sku, selfCheckout: input.lendable && input.selfCheckout };
  const item = await tx.item.update({ where: { id: itemId }, data });
  const changed = Object.keys(input).filter((key) => JSON.stringify((existing as Record<string, unknown>)[key]) !== JSON.stringify((item as Record<string, unknown>)[key]));
  await recordAuditEvent({ client: tx, action: "item.updated", spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Item", targetId: item.id, metadata: { fields: changed.join(",").slice(0, 400) } });
  await emitEvent(tx, { spaceId, type: "item.updated", data: { itemId: item.id, sku: item.sku, name: item.name } });
  if (existing.reorderPoint !== item.reorderPoint) await checkLowStock(tx, [item.id]);
  return item;
}

/** Archive hides an item from the catalogue and pickers; history stays. Stock must be zero and nothing out. */
export async function setItemArchived(tx: Tx, spaceId: string, itemId: string, archived: boolean, actor: Actor) {
  const item = await tx.item.findFirst({ where: { id: itemId, spaceId }, select: { id: true, archivedAt: true } });
  if (!item) notFound("item");
  if (archived) {
    const [stock, out] = await Promise.all([
      tx.stockLevel.aggregate({ where: { itemId }, _sum: { onHand: true } }),
      tx.loanLine.count({ where: { itemId, loan: { status: { in: ["REQUESTED", "APPROVED", "ISSUED", "PARTIALLY_RETURNED"] } } } }),
    ]);
    if ((stock._sum.onHand ?? 0) > 0) throw new DomainError("Write off or move the remaining stock before archiving.", "conflict");
    if (out > 0) throw new DomainError("This item is on an open loan or request.", "conflict");
  }
  await tx.item.update({ where: { id: itemId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAuditEvent({ client: tx, action: archived ? "item.archived" : "item.restored", spaceId, actorId: actor.userId, targetType: "Item", targetId: itemId });
}
