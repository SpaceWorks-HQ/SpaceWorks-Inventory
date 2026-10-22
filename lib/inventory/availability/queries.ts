import "server-only";

import { prisma } from "@/lib/db";

export type ItemAvailability = { onHand: number; reserved: number; quarantined: number; available: number; onLoan: number; inTransit: number };

const EMPTY: ItemAvailability = { onHand: 0, reserved: 0, quarantined: 0, available: 0, onLoan: 0, inTransit: 0 };

/** Read-only totals per item across the space (no locks; for display and reports). */
export async function availabilityFor(spaceId: string, itemIds?: string[]): Promise<Map<string, ItemAvailability>> {
  const ids = itemIds ? [...new Set(itemIds)] : null;
  if (ids && ids.length === 0) return new Map();
  const [levels, loans, transit] = await Promise.all([
    prisma.stockLevel.groupBy({ by: ["itemId"], where: { spaceId, ...(ids ? { itemId: { in: ids } } : {}) }, _sum: { onHand: true, reserved: true, quarantined: true } }),
    prisma.$queryRaw<{ itemId: string; out: bigint }[]>`
      SELECT l."itemId", SUM(l."quantityIssued" - l."quantityReturned" - l."quantityDamaged" - l."quantityLost" - l."quantityConsumed") AS "out"
      FROM "LoanLine" l JOIN "Loan" o ON o."id" = l."loanId"
      WHERE o."spaceId" = ${spaceId} AND o."status" IN ('ISSUED', 'PARTIALLY_RETURNED')
      GROUP BY l."itemId"`,
    prisma.$queryRaw<{ itemId: string; out: bigint }[]>`
      SELECT l."itemId", SUM(l."quantityDispatched" - l."quantityReceived" - l."quantityDamaged" - l."quantityMissing" - l."quantityReturned") AS "out"
      FROM "TransferLine" l JOIN "Transfer" t ON t."id" = l."transferId"
      WHERE t."sourceSpaceId" = ${spaceId} AND t."status" IN ('DISPATCHED', 'PARTIALLY_RECEIVED', 'RETURNING')
      GROUP BY l."itemId"`,
  ]);
  const result = new Map<string, ItemAvailability>();
  const entry = (itemId: string) => {
    let value = result.get(itemId);
    if (!value) result.set(itemId, (value = { ...EMPTY }));
    return value;
  };
  for (const row of levels) {
    const value = entry(row.itemId);
    value.onHand = row._sum.onHand ?? 0;
    value.reserved = row._sum.reserved ?? 0;
    value.quarantined = row._sum.quarantined ?? 0;
    value.available = value.onHand - value.reserved - value.quarantined;
  }
  for (const row of loans) if (!ids || ids.includes(row.itemId)) entry(row.itemId).onLoan = Number(row.out);
  for (const row of transit) if (!ids || ids.includes(row.itemId)) entry(row.itemId).inTransit = Number(row.out);
  return result;
}

export function availabilityOf(map: Map<string, ItemAvailability>, itemId: string): ItemAvailability {
  return map.get(itemId) ?? EMPTY;
}

/** Balances per location for one item. */
export function levelsForItem(spaceId: string, itemId: string) {
  return prisma.stockLevel.findMany({
    where: { spaceId, itemId, OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
    select: { locationId: true, onHand: true, reserved: true, quarantined: true, location: { select: { name: true, code: true } } },
    orderBy: { location: { code: "asc" } },
  });
}
