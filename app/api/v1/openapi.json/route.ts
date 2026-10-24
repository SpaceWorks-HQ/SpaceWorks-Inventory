import { openApiDocument } from "@/lib/api/openapi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/v1/openapi.json: the API description (no key needed; it holds no data). */
export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin;
  return Response.json(openApiDocument(base), { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
