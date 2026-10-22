import { LABEL_SIZES, parseLabelSearchParams, printLabels, type LabelSize } from "@/lib/labels";
import { canPrintLabels, findSpaceForUser, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * A4 PDF of QR labels: `?kind=items|assets|locations|kits|containers` with
 * `&ids=a,b,c` or `&all=1` (optionally `&location=…&category=…`), at most
 * 500 labels, in the space's label size unless `&size=SMALL|MEDIUM|LARGE`.
 * Staff and above only; anyone else gets the same 404 as an unknown space.
 */
export async function GET(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  if (!found || !canPrintLabels(found.membership)) return notFound();

  const params = new URL(request.url).searchParams;
  const query = parseLabelSearchParams(params);
  if (!query.success) {
    return new Response(query.error.issues[0]?.message ?? "Choose what to print.", { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  const sizeParam = params.get("size");
  const size = sizeParam && (LABEL_SIZES as readonly string[]).includes(sizeParam) ? (sizeParam as LabelSize) : null;
  const printed = await printLabels(found.space, query.data, size);
  if (!printed) return notFound();

  const date = new Date().toISOString().slice(0, 10);
  return new Response(Buffer.from(printed.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${found.space.slug}-${query.data.kind}-labels-${date}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Label-Count": String(printed.count),
    },
  });
}
