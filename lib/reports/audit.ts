import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatDayTime } from "@/lib/format/datetime";
import { zonedInputToIso } from "@/lib/timeZone";
import type { ReportTable } from "./table";

/**
 * The space audit log: filter parsing, plain-language action words and safe
 * metadata (pure helpers), plus the paged and export queries. Metadata is
 * shown as scalar key/values only; nested values are never rendered.
 */

export type AuditFilters = { action: string | null; actorId: string | null; targetType: string | null; from: string | null; to: string | null; cursor: string | null };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/** Read `?action=&actor=&target=&from=&to=&cursor=`; anything malformed is dropped. */
export function parseAuditFilters(params: Record<string, string | string[] | undefined>): AuditFilters {
  const action = first(params.action).toLowerCase();
  const actor = first(params.actor);
  const target = first(params.target);
  const from = first(params.from);
  const to = first(params.to);
  const cursor = first(params.cursor);
  return {
    action: /^[a-z_]{1,40}(\.[a-z_]{0,40})?$/.test(action) ? action : null,
    actorId: ID.test(actor) ? actor : null,
    targetType: /^[A-Za-z]{1,40}$/.test(target) ? target : null,
    from: DAY.test(from) ? from : null,
    to: DAY.test(to) ? to : null,
    cursor: ID.test(cursor) ? cursor : null,
  };
}

function dayStart(day: string, timezone: string): Date | null {
  const iso = zonedInputToIso(`${day}T00:00`, timezone);
  return iso ? new Date(iso) : null;
}

/** Prisma filter for a space's events. `to` is inclusive of that whole day in the space time zone. */
export function auditWhere(spaceId: string, filters: AuditFilters, timezone: string): Prisma.AuditEventWhereInput {
  const from = filters.from ? dayStart(filters.from, timezone) : null;
  const toStart = filters.to ? dayStart(filters.to, timezone) : null;
  const to = toStart ? new Date(toStart.getTime() + 86_400_000) : null;
  return {
    spaceId,
    ...(filters.action ? { action: { startsWith: filters.action.endsWith(".") ? filters.action : filters.action.includes(".") ? filters.action : `${filters.action}.` } } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.targetType ? { targetType: filters.targetType } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
  };
}

const ACTION_WORDS: Record<string, string> = {
  "settings.updated": "Changed settings",
  "payments.settings_updated": "Changed payment settings",
  "space.deleted": "Deleted the space",
  "space.sample_data_loaded": "Loaded sample data",
  "member.role_changed": "Changed a member's role",
  "member.suspended": "Suspended a member",
  "member.reactivated": "Restored a member's access",
  "member.removed": "Removed a member",
  "member.left": "Left the space",
  "member.joined": "Joined the space",
  "member.borrowing_changed": "Changed borrowing access",
  "invite.created": "Invited someone",
  "invite.resent": "Resent an invitation",
  "invite.revoked": "Revoked an invitation",
  "invite.accepted": "Accepted an invitation",
  "api_token.created": "Created an API key",
  "api_token.revoked": "Revoked an API key",
  "webhook.created": "Added a webhook",
  "webhook.updated": "Changed a webhook",
  "webhook.enabled": "Switched a webhook on",
  "webhook.disabled": "Switched a webhook off",
  "webhook.rotated": "Replaced a webhook secret",
  "webhook.deleted": "Deleted a webhook",
  "webhook.tested": "Sent a test event",
  "webhook.retried": "Retried a webhook delivery",
  "loan.requested": "Requested a loan",
  "loan.approved": "Approved a loan",
  "loan.rejected": "Rejected a loan",
  "loan.cancelled": "Cancelled a loan",
  "loan.issued": "Issued a loan",
  "loan.returned": "Received a return",
  "loan.renewed": "Renewed a loan",
  "loan.due_changed": "Changed a due date",
  "loan.self_checkout": "Checked out without staff",
  "incident.opened": "Reported a lost or damaged item",
  "incident.resolved": "Resolved a lost or damaged item",
  "item.created": "Added an item",
  "item.updated": "Edited an item",
  "item.archived": "Archived an item",
  "item.restored": "Restored an item",
  "stock.adjusted": "Adjusted stock",
  "stock.received": "Received stock",
  "location.created": "Added a location",
  "location.updated": "Edited a location",
  "location.archived": "Archived a location",
  "count.started": "Started a count",
  "count.posted": "Posted a count",
  "purchase.requested": "Asked for something to be bought",
  "purchase.received": "Received a purchase",
  "payment.recorded": "Recorded a payment",
  "payment.paid": "Received a payment",
  "refund.created": "Started a refund",
  "charge.waived": "Waived a charge",
  "import.applied": "Imported a file",
  "instance.setup_completed": "Set up Space Works",
};

/** "loan.requested" → "Requested a loan"; unknown actions → "Loan: requested". */
export function auditActionWords(action: string): string {
  const known = ACTION_WORDS[action];
  if (known) return known;
  const [area = "", ...rest] = action.split(".");
  const verb = rest.join(" ").replace(/_/g, " ").trim();
  const subject = area.replace(/_/g, " ");
  const label = subject ? subject[0]!.toUpperCase() + subject.slice(1) : "Event";
  return verb ? `${label}: ${verb}` : label;
}

/** "expiresInDays" / "from_status" → "Expires in days" / "From status". */
export function humaniseKey(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_.-]+/g, " ").trim().toLowerCase();
  return words ? words[0]!.toUpperCase() + words.slice(1) : key;
}

const MAX_VALUE = 80;

/** Scalar metadata only, as label/value strings; objects, arrays and over-long keys are left out. */
export function auditMetadataPairs(metadata: unknown): { label: string; value: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const pairs: { label: string; value: string }[] = [];
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>).slice(0, 12)) {
    if (key.length > 40) continue;
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) continue;
    const text = value === null ? "None" : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
    pairs.push({ label: humaniseKey(key), value: text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text });
  }
  return pairs;
}

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_LIMIT = 10_000;

const SELECT = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  createdAt: true,
  actor: { select: { name: true, email: true } },
  actorApiToken: { select: { name: true } },
} satisfies Prisma.AuditEventSelect;

type AuditRow = Prisma.AuditEventGetPayload<{ select: typeof SELECT }>;

export function auditActorName(row: Pick<AuditRow, "actor" | "actorApiToken">): string {
  if (row.actorApiToken) return `API key ${row.actorApiToken.name}`;
  if (row.actor) return row.actor.name ?? row.actor.email;
  return "System";
}

/** One page (newest first) plus the cursor for the next, older page. */
export async function listAuditPage(spaceId: string, filters: AuditFilters, timezone: string) {
  const rows = await prisma.auditEvent.findMany({
    where: auditWhere(spaceId, filters, timezone),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: SELECT,
  }).catch(() => [] as AuditRow[]);
  const more = rows.length > AUDIT_PAGE_SIZE;
  const page = rows.slice(0, AUDIT_PAGE_SIZE);
  return { rows: page, nextCursor: more ? page[page.length - 1]!.id : null };
}

/** The filtered log as one export table (newest first, capped). */
export async function auditExportTable(spaceId: string, filters: AuditFilters, timezone: string): Promise<ReportTable> {
  const rows = await prisma.auditEvent.findMany({
    where: auditWhere(spaceId, filters, timezone),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: AUDIT_EXPORT_LIMIT,
    select: SELECT,
  });
  return {
    title: "Audit log",
    columns: [
      { key: "when", label: "When" },
      { key: "action", label: "Action" },
      { key: "what", label: "What happened" },
      { key: "actor", label: "By" },
      { key: "targetType", label: "Target type" },
      { key: "targetId", label: "Target id" },
      { key: "details", label: "Details" },
    ],
    rows: rows.map((row) => ({
      when: formatDayTime(row.createdAt, timezone),
      action: row.action,
      what: auditActionWords(row.action),
      actor: auditActorName(row),
      targetType: row.targetType,
      targetId: row.targetId,
      details: auditMetadataPairs(row.metadata).map((pair) => `${pair.label}: ${pair.value}`).join("; "),
    })),
  };
}
