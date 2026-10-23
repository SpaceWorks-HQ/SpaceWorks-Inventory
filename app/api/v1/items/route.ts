import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import type { ItemInput } from "@/lib/catalogue/schemas";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { ITEM_SELECT, itemDto } from "@/lib/api/dto";
import { afterCursor, booleanParam, idParam, pageOf, parsePage } from "@/lib/api/pagination";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/items?q=&category=&lendable=&archived=&limit=&cursor= (read:catalogue). */
export async function GET(request: Request) {
  return withApi(request, "read", "read:catalogue", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const q = params.get("q")?.trim().slice(0, 80);
    const categoryId = idParam(params, "category");
    const lendable = booleanParam(params, "lendable");
    const archived = booleanParam(params, "archived") ?? false;
    const where: Prisma.ItemWhereInput = {
      spaceId,
      ...afterCursor(page),
      ...(archived ? {} : { archivedAt: null }),
      ...(categoryId ? { categoryId } : {}),
      ...(lendable !== undefined ? { lendable } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }, { barcode: q }] } : {}),
    };
    const rows = await prisma.item.findMany({ where, select: ITEM_SELECT, orderBy: { id: "asc" }, take: page.limit + 1 });
    const { rows: items, nextCursor } = pageOf(rows, page.limit);
    const availability = await availabilityFor(spaceId, items.map((item) => item.id));
    return apiJson({ data: items.map((item) => itemDto(item, availabilityOf(availability, item.id))), nextCursor });
  });
}

/** POST /api/v1/items (write:catalogue): body is an item (name required; see docs/API.md). */
export async function POST(request: Request) {
  return withApi(request, "write", "write:catalogue", async ({ spaceId, actor }) => {
    const body = await parseBody(request, z.record(z.string(), z.unknown()));
    const created = await prisma.$transaction((tx) => createItem(tx, spaceId, body as ItemInput, actor));
    const item = await prisma.item.findUniqueOrThrow({ where: { id: created.id }, select: ITEM_SELECT });
    return apiJson({ data: itemDto(item) }, 201);
  });
}
