import { prisma } from "@/lib/db";
import { apiJson, notFoundResponse, parseOptionalBody, validId, withApi } from "@/lib/api/context";
import { TRANSFER_SELECT, transferDto } from "@/lib/api/dto";
import { approveSchema, cancelSchema, rejectSchema, TRANSFER_ACTIONS, type TransferApiAction } from "@/lib/api/schemas";
import { apiTransferAction } from "@/lib/api/transfers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEMAS = { approve: approveSchema, reject: rejectSchema, cancel: cancelSchema } as const;

/**
 * POST /api/v1/transfers/{id}/approve | reject | cancel (write:transfers).
 * The sending space approves or rejects; either side may cancel before dispatch.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await context.params;
  return withApi(request, "write", "write:transfers", async ({ spaceId, actor }) => {
    if (!(TRANSFER_ACTIONS as readonly string[]).includes(action)) return notFoundResponse("action");
    if (!validId(id)) return notFoundResponse("transfer");
    const step = action as TransferApiAction;
    const body = await parseOptionalBody(request, SCHEMAS[step]);
    await prisma.$transaction((tx) => apiTransferAction(tx, spaceId, id, step, body, actor));
    const transfer = await prisma.transfer.findUniqueOrThrow({ where: { id }, select: TRANSFER_SELECT });
    return apiJson({ data: transferDto(transfer, spaceId) });
  });
}
