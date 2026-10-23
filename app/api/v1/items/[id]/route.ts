import { prisma } from "@/lib/db";
import { updateItem } from "@/lib/catalogue/items";
import { availabilityFor, availabilityOf, levelsForItem } from "@/lib/inventory/availability";
import { apiJson, notFoundResponse, parseBody, validId, withApi } from "@/lib/api/context";
import { ITEM_SELECT, itemDto } from "@/lib/api/dto";
import { mergeItemPatch } from "@/lib/api/items";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** GET /api/v1/items/{id} (read:catalogue): the item with availability and stock per location. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  return withApi(request, "read", "read:catalogue", async ({ spaceId }) => {
    if (!validId(id)) return notFoundResponse("item");
    const item = await prisma.item.findFirst({ where: { id, spaceId }, select: ITEM_SELECT });
    if (!item) return notFoundResponse("item");
    const [availability, levels] = await Promise.all([availabilityFor(spaceId, [id]), levelsForItem(spaceId, id)]);
    return apiJson({
      data: {
        ...itemDto(item, availabilityOf(availability, id)),
        locations: levels.map((level) => ({ locationId: level.locationId, code: level.location.code, name: level.location.name, onHand: level.onHand, reserved: level.reserved, quarantined: level.quarantined, available: level.onHand - level.reserved - level.quarantined })),
      },
    });
  });
}

/** PATCH /api/v1/items/{id} (write:catalogue): change only the fields sent. */
export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  return withApi(request, "write", "write:catalogue", async ({ spaceId, actor }) => {
    if (!validId(id)) return notFoundResponse("item");
    const patch = await parseBody(request, z.record(z.string(), z.unknown()));
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.item.findFirst({ where: { id, spaceId } });
      if (!existing) return null;
      return updateItem(tx, spaceId, id, mergeItemPatch(existing, patch), actor);
    });
    if (!updated) return notFoundResponse("item");
    const item = await prisma.item.findUniqueOrThrow({ where: { id }, select: ITEM_SELECT });
    return apiJson({ data: itemDto(item) });
  });
}
