import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { apiJson, notFoundResponse, withApi } from "@/lib/api/context";
import { afterCursor, booleanParam, idParam, pageOf, parsePage } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/v1/stock (read:stock): availability per item (on hand, held,
 * quarantined, available, on loan, in transit). With `?item=<id>` it returns
 * that item's balance per location instead. `?low=true` keeps items at or
 * below their reorder point.
 */
export async function GET(request: Request) {
  return withApi(request, "read", "read:stock", async ({ spaceId, params }) => {
    const itemId = idParam(params, "item");
    if (itemId) {
      const item = await prisma.item.findFirst({ where: { id: itemId, spaceId }, select: { id: true, sku: true, name: true } });
      if (!item) return notFoundResponse("item");
      const levels = await prisma.stockLevel.findMany({
        where: { spaceId, itemId },
        select: { locationId: true, onHand: true, reserved: true, quarantined: true, updatedAt: true, location: { select: { code: true, name: true } } },
        orderBy: { location: { code: "asc" } },
        take: 500,
      });
      const totals = availabilityOf(await availabilityFor(spaceId, [itemId]), itemId);
      return apiJson({
        data: {
          item,
          totals,
          locations: levels.map((level) => ({ locationId: level.locationId, code: level.location.code, name: level.location.name, onHand: level.onHand, reserved: level.reserved, quarantined: level.quarantined, available: level.onHand - level.reserved - level.quarantined, updatedAt: level.updatedAt.toISOString() })),
        },
      });
    }
    const page = parsePage(params);
    const low = booleanParam(params, "low") ?? false;
    const where: Prisma.ItemWhereInput = { spaceId, archivedAt: null, ...afterCursor(page), ...(low ? { reorderPoint: { not: null } } : {}) };
    const rows = await prisma.item.findMany({ where, select: { id: true, sku: true, name: true, tracking: true, reorderPoint: true, unit: { select: { symbol: true } } }, orderBy: { id: "asc" }, take: page.limit + 1 });
    const { rows: items, nextCursor } = pageOf(rows, page.limit);
    const availability = await availabilityFor(spaceId, items.map((item) => item.id));
    const data = items
      .map((item) => ({ itemId: item.id, sku: item.sku, name: item.name, tracking: item.tracking, unit: item.unit?.symbol ?? null, reorderPoint: item.reorderPoint, ...availabilityOf(availability, item.id) }))
      .filter((row) => !low || row.available <= (row.reorderPoint ?? -1));
    return apiJson({ data, nextCursor });
  });
}
