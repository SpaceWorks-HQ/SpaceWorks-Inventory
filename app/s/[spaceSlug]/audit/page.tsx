import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/display";
import { ListLayout } from "@/components/ui/layouts";
import { prisma } from "@/lib/db";
import { formatDayTime } from "@/lib/format/datetime";
import { requireSpace } from "@/lib/permissions";
import { auditActionWords, auditActorName, auditMetadataPairs, listAuditPage, parseAuditFilters, type AuditFilters } from "@/lib/reports/audit";
import { AuditFilterBar } from "./_components/AuditFilterBar";
import { AuditTable, type AuditEntry } from "./_components/AuditTable";

export const metadata = { title: "Audit log" };

function filterQuery(filters: AuditFilters, cursor: string | null): string {
  const query = new URLSearchParams();
  if (filters.action) query.set("action", filters.action);
  if (filters.actorId) query.set("actor", filters.actorId);
  if (filters.targetType) query.set("target", filters.targetType);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  if (cursor) query.set("cursor", cursor);
  const text = query.toString();
  return text ? `?${text}` : "";
}

export default async function AuditLogPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/audit">) {
  const { spaceSlug } = await params;
  const { space } = await requireSpace(spaceSlug, "ADMIN");
  const filters = parseAuditFilters(await searchParams);
  const [page, memberships, targets] = await Promise.all([
    listAuditPage(space.id, filters, space.timezone),
    prisma.membership.findMany({ where: { spaceId: space.id }, select: { userId: true, user: { select: { name: true, email: true } } }, orderBy: { user: { name: "asc" } }, take: 500 }),
    prisma.auditEvent.groupBy({ by: ["targetType"], where: { spaceId: space.id, targetType: { not: null } }, orderBy: { targetType: "asc" }, take: 60 }),
  ]);
  const entries: AuditEntry[] = page.rows.map((row) => ({
    id: row.id,
    when: formatDayTime(row.createdAt, space.timezone),
    whenIso: row.createdAt.toISOString(),
    what: auditActionWords(row.action),
    action: row.action,
    actor: auditActorName(row),
    target: row.targetType ? `${row.targetType}${row.targetId ? ` ${row.targetId.slice(-8)}` : ""}` : null,
    details: auditMetadataPairs(row.metadata),
  }));
  const members = memberships.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email }));
  const targetTypes = targets.map((t) => t.targetType).filter((t): t is string => Boolean(t));
  const basePath = `/s/${space.slug}/audit`;
  const exportHref = `${basePath}/export${filterQuery({ ...filters, cursor: null }, null)}`;
  const olderHref = page.nextCursor ? `${basePath}${filterQuery(filters, page.nextCursor)}` : null;
  const newestHref = filters.cursor ? `${basePath}${filterQuery(filters, null)}` : null;
  const filtered = Boolean(filters.action || filters.actorId || filters.targetType || filters.from || filters.to);

  return (
    <ListLayout
      header={<PageHeader title="Audit log" description={`Who changed what in this space. Entries can't be edited or removed. Times are in ${space.timezone}.`} />}
      toolbar={<AuditFilterBar basePath={basePath} filters={filters} members={members} targetTypes={targetTypes} exportHref={exportHref} />}
    >
      {entries.length === 0 ? (
        <EmptyState patch title={filtered ? "Nothing matches these filters." : "Nothing recorded yet."} action={filtered ? <Link href={basePath} className={buttonClasses({ variant: "secondary" })}>Clear filters</Link> : undefined}>
          {filtered ? "Try a wider date range or another area." : "Changes to settings, members and stock show here."}
        </EmptyState>
      ) : (
        <AuditTable entries={entries} />
      )}
      {olderHref || newestHref ? (
        <nav aria-label="Audit log pages" className="flex flex-wrap justify-between gap-2">
          {newestHref ? <Link href={newestHref} className={buttonClasses({ variant: "quiet" })}>Back to newest</Link> : <span />}
          {olderHref ? <Link href={olderHref} className={buttonClasses({ variant: "secondary" })}>Older entries</Link> : null}
        </nav>
      ) : null}
    </ListLayout>
  );
}
