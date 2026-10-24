import { recordAuditEvent } from "@/lib/audit";
import { financeReport, financeTables } from "@/lib/finance";
import { isPeriodGroup } from "@/lib/finance/periods";
import { canViewFinance, findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { parseRange } from "@/lib/reports/range";
import { exportResponse, isExportFormat, tablesToCsv, tablesToXlsx } from "@/lib/reports/table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** GET ?from=&to=&group=day|week|month|fy&format=csv|xlsx. Inventory managers only (everyone else gets 404); audited. */
export async function GET(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  if (!user || !found || !canViewFinance(found.membership) || !isExportFormat(format)) return notFound();
  if (!(await checkRateLimitById("search", `finance-export:${user.id}`))) {
    return new Response("Too many exports. Wait a minute and try again.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  const { space } = found;
  const range = parseRange({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }, space.timezone, new Date(), 366 * 5);
  const groupParam = url.searchParams.get("group");
  const group = isPeriodGroup(groupParam) ? groupParam : "month";
  const tables = financeTables(await financeReport({ id: space.id, slug: space.slug, timezone: space.timezone }, range, group));
  await recordAuditEvent({ action: "finance.exported", spaceId: space.id, actorId: user.id, targetType: "Space", targetId: space.id, metadata: { from: range.fromDay, to: range.toDay, format } });
  const fileBase = `${space.slug}-finance-${range.fromDay}-to-${range.toDay}`;
  if (format === "csv") return exportResponse(tablesToCsv(tables, space.currency), fileBase, "csv");
  return exportResponse(await tablesToXlsx(tables, space.currency), fileBase, "xlsx");
}
