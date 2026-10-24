import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createLocation } from "@/lib/catalogue/locations";
import { locationKinds } from "@/lib/catalogue/schemas";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { locationDto } from "@/lib/api/dto";
import { afterCursor, booleanParam, enumParam, idParam, pageOf, parsePage } from "@/lib/api/pagination";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SELECT = { id: true, parentId: true, kind: true, name: true, code: true, description: true, archivedAt: true } as const;

/** GET /api/v1/locations?parent=&kind=&archived= (read:catalogue). */
export async function GET(request: Request) {
  return withApi(request, "read", "read:catalogue", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const parentId = idParam(params, "parent");
    const kind = enumParam(params, "kind", locationKinds);
    const archived = booleanParam(params, "archived") ?? false;
    const where: Prisma.LocationWhereInput = { spaceId, ...afterCursor(page), ...(archived ? {} : { archivedAt: null }), ...(parentId ? { parentId } : {}), ...(kind ? { kind } : {}) };
    const rows = await prisma.location.findMany({ where, select: SELECT, orderBy: { id: "asc" }, take: page.limit + 1 });
    const { rows: locations, nextCursor } = pageOf(rows, page.limit);
    return apiJson({ data: locations.map(locationDto), nextCursor });
  });
}

/** POST /api/v1/locations (write:catalogue): { name, code, kind?, parentId?, description? }. */
export async function POST(request: Request) {
  return withApi(request, "write", "write:catalogue", async ({ spaceId, actor }) => {
    const body = await parseBody(request, z.record(z.string(), z.unknown()));
    const created = await prisma.$transaction((tx) => createLocation(tx, spaceId, body, actor));
    const location = await prisma.location.findUniqueOrThrow({ where: { id: created.id }, select: SELECT });
    return apiJson({ data: locationDto(location) }, 201);
  });
}
