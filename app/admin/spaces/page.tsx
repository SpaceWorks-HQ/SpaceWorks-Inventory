import { CreateSpaceForm } from "@/components/admin/CreateSpaceForm";
import { SpaceArchiveButton } from "@/components/admin/AdminRowActions";
import { Chip, PageHeader } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { prisma } from "@/lib/db";
import { formatDate, viewerTimeZone } from "@/lib/format/datetime";
import { requireSuperAdminMfa } from "@/lib/permissions";

export const metadata = { title: "Spaces" };

export default async function AdminSpacesPage() {
  await requireSuperAdminMfa();
  const spaces = await prisma.space.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { id: true, name: true, slug: true, createdAt: true, archivedAt: true, _count: { select: { memberships: true } } },
  });
  const tz = viewerTimeZone();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Spaces" description="Names and member counts only; space content stays private to members." />
      <CreateSpaceForm />
      <Table label="Spaces">
        <THead>
          <tr><TH>Space</TH><TH>Members</TH><TH>Created</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></tr>
        </THead>
        <TBody>
          {spaces.map((space) => (
            <TR key={space.id}>
              <TD><span className="block font-semibold">{space.name}</span><span className="block text-caption text-ink-muted">/s/{space.slug}</span></TD>
              <TD className="tabular-nums">{space._count.memberships}</TD>
              <TD className="whitespace-nowrap text-ink-muted">{formatDate(space.createdAt, tz)}</TD>
              <TD>{space.archivedAt ? <Chip tone="neutral" size="sm">Archived</Chip> : <Chip tone="success" size="sm">Active</Chip>}</TD>
              <TD className="text-right"><SpaceArchiveButton spaceId={space.id} archived={Boolean(space.archivedAt)} /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
