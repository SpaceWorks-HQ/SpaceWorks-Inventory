import { prisma } from "@/lib/db";
import { apiJson, notFoundResponse, validId, withApi } from "@/lib/api/context";
import { loanDto, loanSelect } from "@/lib/api/dto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/loans/{id} (read:loans). */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return withApi(request, "read", "read:loans", async ({ spaceId }) => {
    if (!validId(id)) return notFoundResponse("loan");
    const loan = await prisma.loan.findFirst({ where: { id, spaceId }, select: loanSelect(spaceId) });
    return loan ? apiJson({ data: loanDto(loan) }) : notFoundResponse("loan");
  });
}
