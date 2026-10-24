import { loadMovements, movementWhere, parseMovementFilters } from "@/lib/catalogue/views";
import { formatDate, formatTime } from "@/lib/format/datetime";
import { canViewReports, findSpaceForUser, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ROWS = 50_000;
const BATCH = 1000;
const HEADER = ["Date", "Time", "Type", "Reason", "Item", "SKU", "Asset tag", "Location", "Change", "Held change", "Repair change", "On hand after", "Who", "Reference", "Note"];

/** One CSV cell; text that a spreadsheet would run as a formula gets a leading quote. */
function cell(value: string | number | null) {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The stock ledger as CSV with the ledger page's filters, newest first, at
 * most 50,000 rows, streamed in batches. Managers and above; anyone else
 * gets the same 404 as an unknown space.
 */
export async function GET(request: Request, context: { params: Promise<{ spaceSlug: string }> }) {
  const { spaceSlug } = await context.params;
  const user = await getCurrentUser();
  const found = user ? await findSpaceForUser(spaceSlug, user.id) : null;
  if (!found || !canViewReports(found.membership)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const { space } = found;
  const filters = parseMovementFilters(Object.fromEntries(new URL(request.url).searchParams));
  const where = await movementWhere(space.id, filters, space.timezone);
  const encoder = new TextEncoder();
  let cursor: string | undefined;
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`﻿${HEADER.join(",")}\r\n`));
    },
    async pull(controller) {
      const rows = await loadMovements(space.id, space.slug, where, { take: Math.min(BATCH, MAX_ROWS - sent), cursor });
      const lines = rows.map((row) => [
        formatDate(row.createdAt, space.timezone), formatTime(row.createdAt, space.timezone), row.type, row.reason, row.item.name, row.item.sku, row.asset?.assetTag ?? null,
        row.location, row.quantity, row.reservedDelta, row.quarantinedDelta, row.location ? row.balanceAfter : null, row.actor, row.ref?.label ?? null, row.note,
      ].map(cell).join(","));
      if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
      sent += rows.length;
      cursor = rows.at(-1)?.id;
      if (rows.length < BATCH || sent >= MAX_ROWS) controller.close();
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${space.slug}-stock-ledger-${date}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
