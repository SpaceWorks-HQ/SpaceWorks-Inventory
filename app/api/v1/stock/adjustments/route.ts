import { prisma } from "@/lib/db";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { adjustmentSchema } from "@/lib/api/schemas";
import { apiAdjustStock } from "@/lib/api/stock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/v1/stock/adjustments (write:stock): { itemId, locationId, delta, reason, note? }. */
export async function POST(request: Request) {
  return withApi(request, "write", "write:stock", async ({ spaceId, actor }) => {
    const input = await parseBody(request, adjustmentSchema);
    const balance = await prisma.$transaction((tx) => apiAdjustStock(tx, spaceId, input, actor));
    return apiJson({ data: balance }, 201);
  });
}
