import { prisma } from "@/lib/db";
import { apiJson, parseBody, withApi } from "@/lib/api/context";
import { receiptSchema } from "@/lib/api/schemas";
import { apiReceiveStock } from "@/lib/api/stock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/v1/stock/receipts (write:stock): { itemId, locationId, quantity, unitCostMinor?, reason?, note? }. */
export async function POST(request: Request) {
  return withApi(request, "write", "write:stock", async ({ spaceId, actor }) => {
    const input = await parseBody(request, receiptSchema);
    const balance = await prisma.$transaction((tx) => apiReceiveStock(tx, spaceId, input, actor));
    return apiJson({ data: balance }, 201);
  });
}
