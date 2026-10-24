import Link from "next/link";
import { InvitationsPanel } from "@/components/settings/InvitationsPanel";
import { MembersTable } from "@/components/settings/MembersTable";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeading } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { ListLayout } from "@/components/ui/layouts";
import { formatDate, formatRelativeTime } from "@/lib/format/datetime";
import { requireSpace } from "@/lib/permissions";
import { assignableRoles, canManageMembers, isSpaceRole, roleLabel, SPACE_ROLES } from "@/lib/roles";
import { listMembersForAdmin, listOpenInvitations } from "@/lib/setup/members";

export const metadata = { title: "Members" };

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function MembersPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/members">) {
  const { spaceSlug } = await params;
  const query = await searchParams;
  const { space, membership } = await requireSpace(spaceSlug, "MANAGER");
  const q = one(query.q).trim().slice(0, 80);
  const roleFilter = isSpaceRole(one(query.role)) ? (one(query.role) as (typeof SPACE_ROLES)[number]) : null;
  const isAdmin = canManageMembers(membership);
  const [rows, invitationRows] = await Promise.all([
    listMembersForAdmin(space.id, { q, role: roleFilter }),
    isAdmin ? listOpenInvitations(space.id) : Promise.resolve([]),
  ]);
  const tz = space.timezone;
  const members = rows.map((row) => ({
    membershipId: row.membershipId,
    name: row.name,
    email: row.email,
    image: row.image,
    role: row.role,
    status: row.status,
    borrowingStatus: row.borrowingStatus,
    borrowingNote: row.borrowingNote,
    borrowingAuto: row.borrowingAuto,
    memberNumber: row.memberNumber,
    activeLoans: row.activeLoans,
    openIncidents: row.openIncidents,
    joined: formatDate(row.joinedAt, tz),
    isSelf: row.membershipId === membership.id,
  }));
  const invitations = invitationRows.map((row) => ({ id: row.id, email: row.email, role: row.role, state: row.state, invitedBy: row.invitedBy, sentLabel: formatRelativeTime(row.sentAt, tz) }));
  const inviteRoles = assignableRoles(membership);
  const filtered = Boolean(q || roleFilter);

  return (
    <ListLayout
      header={
        <PageHeader
          title="Members"
          description={isAdmin ? "Everyone in this space, their role and whether they can borrow. Invite people below." : "Everyone in this space and whether they can borrow. Inventory managers change roles and invite people."}
        />
      }
      toolbar={
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto_auto] sm:items-end">
          <Field label="Search" hideLabel>
            <Input name="q" defaultValue={q} placeholder="Name, email or member number" />
          </Field>
          <Field label="Role" hideLabel>
            <Dropdown name="role" defaultValue={roleFilter ?? ""}>
              <option value="">All roles</option>
              {SPACE_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
            </Dropdown>
          </Field>
          <Button type="submit" variant="secondary">Search</Button>
          {filtered ? <Button asChild variant="quiet"><Link href={`/s/${space.slug}/members`}>Clear filters</Link></Button> : null}
        </form>
      }
    >
      <MembersTable slug={space.slug} actorRole={membership.role} members={members} />
      {isAdmin ? (
        <section className="flex flex-col gap-4">
          <SectionHeading title="Invitations" description="Invite people by email, other inventory managers included." />
          <InvitationsPanel slug={space.slug} roles={inviteRoles} invitations={invitations} />
        </section>
      ) : null}
    </ListLayout>
  );
}
