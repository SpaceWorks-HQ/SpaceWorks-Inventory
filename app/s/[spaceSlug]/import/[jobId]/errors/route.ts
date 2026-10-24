import { importErrorReport } from "@/lib/importer";
import { canImport, findSpaceForUser, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** CSV of an import's rows with errors (row number, errors, values). Managers and above; everyone else gets 404. */
export async function GET(_request: Request, context: { params: Promise<{ spaceSlug: string; jobId: string }> }) {
  const { spaceSlug, jobId } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  const report = found && canImport(found.membership) && jobId.length <= 64 ? await importErrorReport(found.space.id, jobId) : null;
  if (!report) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return new Response(`﻿${report.csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${report.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
