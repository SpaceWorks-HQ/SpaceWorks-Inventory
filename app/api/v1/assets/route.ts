import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiJson, withApi } from "@/lib/api/context";
import { assetDto } from "@/lib/api/dto";
import { afterCursor, enumParam, idParam, pageOf, parsePage } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = ["AVAILABLE", "RESERVED", "ON_LOAN", "IN_TRANSIT", "MAINTENANCE", "LOST", "RETIRED"] as const;

/** GET /api/v1/assets?item=&location=&status= (read:stock): serialized units with tag, status and whereabouts. */
export async function GET(request: Request) {
  return withApi(request, "read", "read:stock", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const itemId = idParam(params, "item");
    const locationId = idParam(params, "location");
    const status = enumParam(params, "status", STATUSES);
    const tag = params.get("tag")?.trim().toUpperCase().slice(0, 40);
    const where: Prisma.AssetWhereInput = { spaceId, ...afterCursor(page), ...(itemId ? { itemId } : {}), ...(locationId ? { locationId } : {}), ...(status ? { status } : {}), ...(tag ? { assetTag: tag } : {}) };
    const rows = await prisma.asset.findMany({
      where,
      select: { id: true, itemId: true, assetTag: true, serialNumber: true, status: true, condition: true, locationId: true, purchasedAt: true, warrantyUntil: true, createdAt: true },
      orderBy: { id: "asc" },
      take: page.limit + 1,
    });
    const { rows: assets, nextCursor } = pageOf(rows, page.limit);
    return apiJson({ data: assets.map(assetDto), nextCursor });
  });
}
