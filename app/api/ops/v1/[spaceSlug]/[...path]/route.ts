import { inventoryOpsHttp } from "@/lib/agents/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ spaceSlug: string; path: string[] }> };

export async function GET(request: Request, context: Context) {
  const { spaceSlug, path } = await context.params;
  return inventoryOpsHttp(request, spaceSlug, path);
}

export async function POST(request: Request, context: Context) {
  const { spaceSlug, path } = await context.params;
  return inventoryOpsHttp(request, spaceSlug, path);
}
