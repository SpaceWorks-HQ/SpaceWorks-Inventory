import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { TRANSFER_SELECT, transferDto } from "@/lib/api/dto";
import { afterCursor, enumParam, pageOf, parsePage } from "@/lib/api/pagination";
import { transferRequestSchema } from "@/lib/api/schemas";
import { apiRequestTransfer } from "@/lib/api/transfers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "DISPATCHED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED", "RETURNING", "RETURNED"] as const;
const DIRECTIONS = ["in", "out", "internal"] as const;

function directionWhere(spaceId: string, direction: (typeof DIRECTIONS)[number] | undefined): Prisma.TransferWhereInput {
  if (direction === "internal") return { sourceSpaceId: spaceId, destSpaceId: spaceId };
  if (direction === "out") return { sourceSpaceId: spaceId, NOT: { destSpaceId: spaceId } };
  if (direction === "in") return { destSpaceId: spaceId, NOT: { sourceSpaceId: spaceId } };
  return { OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] };
}

/** GET /api/v1/transfers?status=&direction=in|out|internal (read:transfers). */
export async function GET(request: Request) {
  return withApi(request, "read", "read:transfers", async ({ spaceId, params }) => {
    const page = parsePage(params);
    const status = enumParam(params, "status", STATUSES);
    const direction = enumParam(params, "direction", DIRECTIONS);
    const where: Prisma.TransferWhereInput = { AND: [directionWhere(spaceId, direction), { ...afterCursor(page), ...(status ? { status } : {}) }] };
    const rows = await prisma.transfer.findMany({ where, select: TRANSFER_SELECT, orderBy: { id: "asc" }, take: page.limit + 1 });
    const { rows: transfers, nextCursor } = pageOf(rows, page.limit);
    return apiJson({ data: transfers.map((transfer) => transferDto(transfer, spaceId)), nextCursor });
  });
}

/**
 * POST /api/v1/transfers (write:transfers): move stock between this space's
 * locations, or push it to another space (`destinationSpace` slug).
 */
export async function POST(request: Request) {
  return withApi(request, "write", "write:transfers", async ({ spaceId, actor }) => {
    const input = await parseBody(request, transferRequestSchema);
    const created = await prisma.$transaction((tx) => apiRequestTransfer(tx, spaceId, input, actor));
    const transfer = await prisma.transfer.findUniqueOrThrow({ where: { id: created.id }, select: TRANSFER_SELECT });
    return apiJson({ data: transferDto(transfer, spaceId) }, 201);
  });
}
