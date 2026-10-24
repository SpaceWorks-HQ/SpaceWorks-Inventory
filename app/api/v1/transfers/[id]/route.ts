import { prisma } from "@/lib/db";
import { apiJson, notFoundResponse, validId, withApi } from "@/lib/api/context";
import { TRANSFER_SELECT, transferDto } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/transfers/{id} (read:transfers): transfers this space sends or receives. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withApi(request, "read", "read:transfers", async ({ spaceId }) => {
    if (!validId(id)) return notFoundResponse("transfer");
    const transfer = await prisma.transfer.findFirst({ where: { id, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] }, select: TRANSFER_SELECT });
    return transfer ? apiJson({ data: transferDto(transfer, spaceId) }) : notFoundResponse("transfer");
  });
}
