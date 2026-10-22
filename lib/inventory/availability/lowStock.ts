import "server-only";

import type { Tx } from "@/lib/db";
import { emitEvent } from "@/lib/events/emit";
import { createNotifications } from "@/lib/notifications";

/** Space-wide free quantity of one item (every location). */
export async function availableTotal(tx: Tx, itemId: string) {
  const [row] = await tx.$queryRaw<{ available: bigint | null }[]>`
    SELECT SUM("onHand" - "reserved" - "quarantined") AS "available" FROM "StockLevel" WHERE "itemId" = ${itemId}`;
  return Number(row?.available ?? 0);
}

/**
 * Edge-triggered low-stock alert: fires once when free stock falls to the
 * reorder point and re-arms when stock recovers above it. Call after a
 * change, inside the same transaction (the Item row is already locked).
 */
export async function checkLowStock(tx: Tx, itemIds: string[]) {
  for (const itemId of [...new Set(itemIds)]) {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      select: { id: true, spaceId: true, sku: true, name: true, reorderPoint: true, lowStockAlertAt: true, archivedAt: true, space: { select: { slug: true, notifyLowStock: true } } },
    });
    if (!item || item.reorderPoint === null || item.archivedAt) continue;
    const available = await availableTotal(tx, itemId);
    if (available > item.reorderPoint) {
      if (item.lowStockAlertAt) await tx.item.update({ where: { id: itemId }, data: { lowStockAlertAt: null } });
      continue;
    }
    if (item.lowStockAlertAt) continue;
    await tx.item.update({ where: { id: itemId }, data: { lowStockAlertAt: new Date() } });
    await emitEvent(tx, { spaceId: item.spaceId, type: "stock.low", data: { itemId: item.id, sku: item.sku, available, reorderPoint: item.reorderPoint } });
    if (!item.space.notifyLowStock) continue;
    const managers = await tx.membership.findMany({ where: { spaceId: item.spaceId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MANAGER"] } }, select: { userId: true } });
    await createNotifications(managers.map((manager) => ({
      userId: manager.userId,
      spaceId: item.spaceId,
      kind: "stock.low",
      title: `${item.name} is low: ${available} left`,
      body: `Reorder point is ${item.reorderPoint}.`,
      url: `/s/${item.space.slug}/items/${item.id}`,
    })), { client: tx });
  }
}
