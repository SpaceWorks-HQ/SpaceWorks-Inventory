import { recordAuditEvent } from "@/lib/audit";
import { canViewReports, findSpaceForUser, getCurrentUser } from "@/lib/permissions";
import { checkRateLimitById } from "@/lib/rateLimit";
import { isReportKey, parseRange, reportTables } from "@/lib/reports";
import { exportResponse, isExportFormat, tablesToCsv, tablesToXlsx } from "@/lib/reports/table";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * GET ?report=valuation|low-stock|movements|loans|incidents|transfers|payments|repairs&format=csv|xlsx[&from=&to=]
 * Managers and above; everyone else (and any unknown report) gets 404.
 */
export async function GET(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  const url = new URL(request.url);
  const report = url.searchParams.get("report");
  const format = url.searchParams.get("format");
  if (!user || !found || !canViewReports(found.membership) || !isReportKey(report) || !isExportFormat(format)) return notFound();
  // Exports run several queries each; share the search bucket (60 a minute per person).
  if (!(await checkRateLimitById("search", `report-export:${user.id}`))) {
    return new Response("Too many exports. Wait a minute and try again.", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  const { space } = found;
  const range = parseRange({ from: url.searchParams.get("from") ?? undefined, to: url.searchParams.get("to") ?? undefined }, space.timezone);
  const { tables } = await reportTables(report, { id: space.id, timezone: space.timezone }, range);
  await recordAuditEvent({ action: "report.exported", spaceId: space.id, actorId: user.id, targetType: "Space", targetId: space.id, metadata: { report, format, from: range.fromDay, to: range.toDay } });
  const fileBase = `${space.slug}-${report}-${range.fromDay}-to-${range.toDay}`;
  const finalBase = report === "valuation" || report === "low-stock" ? `${space.slug}-${report}-${range.toDay}` : fileBase;
  if (format === "csv") return exportResponse(tablesToCsv(tables, space.currency), finalBase, "csv");
  return exportResponse(await tablesToXlsx(tables, space.currency), finalBase, "xlsx");
}
