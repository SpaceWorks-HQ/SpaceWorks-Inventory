import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { categorySchema, supplierSchema, unitSchema } from "./schemas";

type Actor = { userId: string | null };

async function assertCategoryParent(tx: Tx, spaceId: string, parentId: string | null, selfId?: string) {
  let current = parentId;
  for (let depth = 0; current; depth += 1) {
    if (current === selfId) throw new DomainError("A category can't sit inside itself.", "invalid");
    if (depth > 6) throw new DomainError("Categories can nest at most 6 levels deep.", "invalid");
    const parent: { parentId: string | null } | null = await tx.category.findFirst({ where: { id: current, spaceId }, select: { parentId: true } });
    if (!parent) notFound("parent category");
    current = parent.parentId;
  }
}

export async function saveCategory(tx: Tx, spaceId: string, categoryId: string | null, raw: unknown, actor: Actor) {
  const input = categorySchema.parse(raw);
  await assertCategoryParent(tx, spaceId, input.parentId, categoryId ?? undefined);
  const clash = await tx.category.findFirst({ where: { spaceId, name: input.name, ...(categoryId ? { NOT: { id: categoryId } } : {}) }, select: { id: true } });
  if (clash) throw new DomainError("A category with that name already exists.", "conflict");
  if (categoryId && !(await tx.category.findFirst({ where: { id: categoryId, spaceId }, select: { id: true } }))) notFound("category");
  const category = categoryId
    ? await tx.category.update({ where: { id: categoryId }, data: input })
    : await tx.category.create({ data: { ...input, spaceId } });
  await recordAuditEvent({ client: tx, action: categoryId ? "category.updated" : "category.created", spaceId, actorId: actor.userId, targetType: "Category", targetId: category.id });
  return category;
}

export async function deleteCategory(tx: Tx, spaceId: string, categoryId: string, actor: Actor) {
  const category = await tx.category.findFirst({ where: { id: categoryId, spaceId }, select: { id: true, _count: { select: { items: true, children: true } } } });
  if (!category) notFound("category");
  if (category._count.children > 0) throw new DomainError("Move or delete its sub-categories first.", "conflict");
  // Items keep existing; they simply lose the category.
  await tx.item.updateMany({ where: { categoryId, spaceId }, data: { categoryId: null } });
  await tx.category.delete({ where: { id: categoryId } });
  await recordAuditEvent({ client: tx, action: "category.deleted", spaceId, actorId: actor.userId, targetType: "Category", targetId: categoryId, metadata: { items: category._count.items } });
}

export async function saveUnit(tx: Tx, spaceId: string, unitId: string | null, raw: unknown, actor: Actor) {
  const input = unitSchema.parse(raw);
  const clash = await tx.unit.findFirst({ where: { spaceId, name: input.name, ...(unitId ? { NOT: { id: unitId } } : {}) }, select: { id: true } });
  if (clash) throw new DomainError("A unit with that name already exists.", "conflict");
  if (unitId && !(await tx.unit.findFirst({ where: { id: unitId, spaceId }, select: { id: true } }))) notFound("unit");
  const unit = unitId ? await tx.unit.update({ where: { id: unitId }, data: input }) : await tx.unit.create({ data: { ...input, spaceId } });
  await recordAuditEvent({ client: tx, action: unitId ? "unit.updated" : "unit.created", spaceId, actorId: actor.userId, targetType: "Unit", targetId: unit.id });
  return unit;
}

export async function deleteUnit(tx: Tx, spaceId: string, unitId: string, actor: Actor) {
  const unit = await tx.unit.findFirst({ where: { id: unitId, spaceId }, select: { id: true, _count: { select: { items: true } } } });
  if (!unit) notFound("unit");
  if (unit._count.items > 0) throw new DomainError(`${unit._count.items} items use this unit. Change them first.`, "conflict");
  await tx.unit.delete({ where: { id: unitId } });
  await recordAuditEvent({ client: tx, action: "unit.deleted", spaceId, actorId: actor.userId, targetType: "Unit", targetId: unitId });
}

export async function saveSupplier(tx: Tx, spaceId: string, supplierId: string | null, raw: unknown, actor: Actor) {
  const input = supplierSchema.parse(raw);
  const clash = await tx.supplier.findFirst({ where: { spaceId, name: input.name, ...(supplierId ? { NOT: { id: supplierId } } : {}) }, select: { id: true } });
  if (clash) throw new DomainError("A supplier with that name already exists.", "conflict");
  if (supplierId && !(await tx.supplier.findFirst({ where: { id: supplierId, spaceId }, select: { id: true } }))) notFound("supplier");
  const supplier = supplierId ? await tx.supplier.update({ where: { id: supplierId }, data: input }) : await tx.supplier.create({ data: { ...input, spaceId } });
  await recordAuditEvent({ client: tx, action: supplierId ? "supplier.updated" : "supplier.created", spaceId, actorId: actor.userId, targetType: "Supplier", targetId: supplier.id });
  return supplier;
}
