"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis } from "lucide-react";
import type { BorrowingStatus, MembershipStatus, SpaceRole } from "@prisma/client";
import { changeMemberRoleAction, removeMemberAction, setMemberStatusAction } from "@/app/actions/members";
import { IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Avatar, Chip, EmptyState } from "@/components/ui/display";
import { Dropdown } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BorrowingChip } from "@/components/inventory/StatusChips";
import { useToast } from "@/components/feedback/ToastProvider";
import { assignableRoles, canManageMembers, roleLabel } from "@/lib/roles";
import { BorrowingAccessDialog, type BorrowingTarget } from "./BorrowingAccessDialog";

export type MemberRow = {
  membershipId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: SpaceRole;
  status: MembershipStatus;
  borrowingStatus: BorrowingStatus;
  borrowingNote: string | null;
  borrowingAuto: boolean;
  memberNumber: string | null;
  activeLoans: number;
  openIncidents: number;
  joined: string;
  isSelf: boolean;
};

/** Members list: inventory managers change anyone else's role (other managers included), access and borrowing standing. */
export function MembersTable({ slug, actorRole, members }: { slug: string; actorRole: SpaceRole; members: MemberRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<MemberRow | null>(null);
  const [borrowing, setBorrowing] = useState<BorrowingTarget | null>(null);
  const actor = { role: actorRole };
  const roles = assignableRoles(actor);
  const admin = canManageMembers(actor);

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) showToast(result.error ?? "Couldn't save. Try again.", "error");
      else {
        showToast(success, "success");
        router.refresh();
      }
    });

  if (members.length === 0) return <EmptyState title="No members match.">Try another name, or clear the filters.</EmptyState>;

  return (
    <>
      <Table label="Members">
        <THead>
          <tr>
            <TH>Member</TH>
            <TH>Role</TH>
            <TH>Access</TH>
            <TH>Borrowing</TH>
            <TH>Member no.</TH>
            <TH>On loan</TH>
            <TH>Open incidents</TH>
            <TH>Joined</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </THead>
        <TBody>
          {members.map((member) => {
            const name = member.name ?? member.email;
            const editable = admin && !member.isSelf;
            return (
              <TR key={member.membershipId}>
                <TD>
                  <span className="flex items-center gap-3">
                    <Avatar name={name} src={member.image} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{name}{member.isSelf ? " (you)" : ""}</span>
                      {member.name ? <span className="block truncate text-caption text-ink-muted">{member.email}</span> : null}
                    </span>
                  </span>
                </TD>
                <TD className="min-w-[170px]">
                  {editable ? (
                    <Dropdown
                      aria-label={`Role for ${name}`}
                      value={member.role}
                      disabled={pending}
                      onChange={(event) => run(() => changeMemberRoleAction(slug, { membershipId: member.membershipId, role: event.target.value }), "Role updated.")}
                    >
                      {[...new Set([member.role, ...roles])].map((role) => (
                        <option key={role} value={role} disabled={!roles.includes(role)}>{roleLabel(role)}</option>
                      ))}
                    </Dropdown>
                  ) : (
                    roleLabel(member.role)
                  )}
                </TD>
                <TD>{member.status === "ACTIVE" ? <Chip tone="success" size="sm">Active</Chip> : <Chip tone="warning" size="sm">Suspended</Chip>}</TD>
                <TD>
                  <BorrowingChip status={member.borrowingStatus} />
                  {member.borrowingStatus !== "GOOD" && member.borrowingAuto ? <span className="mt-0.5 block text-caption text-ink-muted">Automatic</span> : null}
                </TD>
                <TD className="tabular-nums">{member.memberNumber ?? <span className="text-ink-muted">None</span>}</TD>
                <TD className="tabular-nums">{member.activeLoans}</TD>
                <TD className="tabular-nums">{member.openIncidents > 0 ? <Chip tone="danger" size="sm">{`${member.openIncidents} open`}</Chip> : 0}</TD>
                <TD className="whitespace-nowrap tabular-nums text-ink-muted">{member.joined}</TD>
                <TD className="w-12 text-right">
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton label={`Actions for ${name}`} size="sm" variant="quiet"><Ellipsis /></IconButton>
                    </MenuTrigger>
                    <MenuContent align="end">
                      <MenuItem onSelect={() => setBorrowing({ membershipId: member.membershipId, name, borrowingStatus: member.borrowingStatus, borrowingNote: member.borrowingNote, borrowingAuto: member.borrowingAuto, memberNumber: member.memberNumber })}>
                        Borrowing access
                      </MenuItem>
                      {editable && member.status === "ACTIVE" ? (
                        <MenuItem onSelect={() => run(() => setMemberStatusAction(slug, { membershipId: member.membershipId, status: "SUSPENDED" }), "Member suspended.")}>Suspend access to the space</MenuItem>
                      ) : null}
                      {editable && member.status !== "ACTIVE" ? (
                        <MenuItem onSelect={() => run(() => setMemberStatusAction(slug, { membershipId: member.membershipId, status: "ACTIVE" }), "Access restored.")}>Restore access</MenuItem>
                      ) : null}
                      {editable ? <MenuItem danger onSelect={() => setRemoving(member)}>Remove from space</MenuItem> : null}
                    </MenuContent>
                  </Menu>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      {borrowing ? <BorrowingAccessDialog key={borrowing.membershipId} slug={slug} member={borrowing} onClose={() => setBorrowing(null)} /> : null}
      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? removing?.email ?? "this member"}?`}
        message="They lose access to this space at once. Their loans, incidents and payments stay on record; items they still hold must come back to the desk."
        confirmLabel="Remove member"
        loading={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          startTransition(async () => {
            const result = await removeMemberAction(slug, { membershipId: target.membershipId });
            setRemoving(null);
            if (!result.ok) showToast(result.error, "error");
            else {
              showToast("Member removed.", "success");
              router.refresh();
            }
          });
        }}
      />
    </>
  );
}
