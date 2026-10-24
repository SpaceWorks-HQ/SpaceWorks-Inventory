import { inventoryTelegramHttp } from "@/lib/agents/telegram/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  return inventoryTelegramHttp(request, (await context.params).spaceSlug);
}
export async function DELETE(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  return inventoryTelegramHttp(request, (await context.params).spaceSlug);
}
