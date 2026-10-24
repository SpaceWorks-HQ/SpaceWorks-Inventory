import { canViewAuditLog, findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { auditExportTable, parseAuditFilters } from "@/lib/reports/audit";
import { exportResponse, tablesToCsv } from "@/lib/reports/table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** CSV of the filtered audit log (inventory managers; everyone else gets 404). Same filters as the page, newest first, capped. */
export async function GET(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  if (!user || !found || !canViewAuditLog(found.membership)) return NOT_FOUND();
  if (!(await checkRateLimitById("dataExport", `audit:${user.id}`))) {
    return new Response("Too many exports. Try again in an hour.", { status: 429, headers: { "Retry-After": "3600", "Cache-Control": "private, no-store" } });
  }
  const filters = parseAuditFilters(Object.fromEntries(new URL(request.url).searchParams));
  const table = await auditExportTable(found.space.id, { ...filters, cursor: null }, found.space.timezone);
  const day = new Date().toISOString().slice(0, 10);
  return exportResponse(tablesToCsv([table], found.space.currency), `audit-${found.space.slug}-${day}`, "csv");
}
