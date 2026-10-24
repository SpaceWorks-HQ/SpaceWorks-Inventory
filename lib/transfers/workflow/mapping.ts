import "server-only";

import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { newQrCode } from "@/lib/catalogue/qr";
import type { LockedTransfer } from "./common";

/**
 * The receiving space's catalogue item for a transfer line. Inside one space
 * it is the same item. Between spaces it is the destination item with the
 * same SKU and tracking; when there is none, a copy is created (not lendable
 * until a manager says so), carrying the source's average cost.
 */
export async function destinationItem(tx: Tx, transfer: LockedTransfer, line: LockedTransfer["lines"][number]): Promise<string> {
  if (line.destItemId) return line.destItemId;
  const destSpaceId = transfer.destSpaceId;
  const existing = await tx.item.findUnique({ where: { spaceId_sku: { spaceId: destSpaceId, sku: line.item.sku } }, select: { id: true, tracking: true, archivedAt: true } });
  let itemId: string;
  if (existing) {
    if (existing.tracking !== line.item.tracking) throw new DomainError(`SKU ${line.item.sku} is tracked differently in the receiving space. Rename one of them first.`, "conflict");
    if (existing.archivedAt) await tx.item.update({ where: { id: existing.id }, data: { archivedAt: null } });
    itemId = existing.id;
  } else {
    const [category, unit] = await Promise.all([
      line.item.category ? tx.category.findFirst({ where: { spaceId: destSpaceId, name: line.item.category.name }, select: { id: true } }) : null,
      line.item.unit ? tx.unit.findFirst({ where: { spaceId: destSpaceId, name: line.item.unit.name }, select: { id: true } }) : null,
    ]);
    const created = await tx.item.create({
      data: {
        spaceId: destSpaceId, sku: line.item.sku, name: line.item.name, description: line.item.description, brand: line.item.brand, model: line.item.model,
        tracking: line.item.tracking, qrCode: newQrCode("item"), categoryId: category?.id ?? null, unitId: unit?.id ?? null,
        unitCostMinor: line.item.unitCostMinor, avgCostMinor: line.item.avgCostMinor, lendable: false,
      },
    });
    itemId = created.id;
  }
  await tx.transferLine.update({ where: { id: line.id }, data: { destItemId: itemId } });
  line.destItemId = itemId;
  return itemId;
}
