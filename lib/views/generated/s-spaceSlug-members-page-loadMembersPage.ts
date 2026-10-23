// Generated from app/s/[spaceSlug]/members/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { formatDate, formatRelativeTime } from "@/lib/format/datetime";
import { requireSpace } from "@/lib/permissions";
import { assignableRoles, canManageMembers, isSpaceRole, SPACE_ROLES } from "@/lib/roles";
import { listMembersForAdmin, listOpenInvitations } from "@/lib/setup/members";
function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}
export async function loadMembersPage({ params, searchParams }: PageProps<"/s/[spaceSlug]/members">) {
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
return viewDto({ space, membership, q, roleFilter, isAdmin, members, invitations, inviteRoles, filtered } as const);
}
