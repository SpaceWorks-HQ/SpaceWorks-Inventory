import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setBorrowingStatus } from "@/lib/lending/access";
import { changeMemberRole, LAST_MANAGER_ERROR, removeMember, setMemberStatus } from "@/lib/membership";
import { listMembersForAdmin, listOpenInvitations } from "@/lib/setup/members";
import { addMember, cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

describe("members list", () => {
  it("lists every member with role, standing, member number and counts", async () => {
    const rows = await listMembersForAdmin(ctx.space.id);
    expect(rows.map((row) => row.role)).toEqual(["MANAGER", "STAFF", "MEMBER"]);
    const member = rows.find((row) => row.userId === ctx.member.id)!;
    expect(member).toMatchObject({ email: ctx.member.email, borrowingStatus: "GOOD", memberNumber: null, activeLoans: 0, openIncidents: 0, status: "ACTIVE" });
  });

  it("filters by search text and role", async () => {
    await prisma.membership.update({ where: { id: ctx.membership.id }, data: { memberNumber: "TSK-118" } });
    expect((await listMembersForAdmin(ctx.space.id, { q: "tsk-11" })).map((row) => row.userId)).toEqual([ctx.member.id]);
    expect((await listMembersForAdmin(ctx.space.id, { q: `staff${ctx.domain}` })).map((row) => row.userId)).toEqual([ctx.staff.id]);
    expect((await listMembersForAdmin(ctx.space.id, { role: "MANAGER" })).map((row) => row.userId)).toEqual([ctx.owner.id]);
    expect(await listMembersForAdmin(ctx.space.id, { q: "nobody-like-this" })).toEqual([]);
  });

  it("lists pending and expired invitations, not accepted or revoked ones", async () => {
    const now = new Date();
    const base = { spaceId: ctx.space.id, role: "MEMBER" as const, invitedById: ctx.owner.id };
    await prisma.invitation.createMany({
      data: [
        { ...base, email: `pending${ctx.domain}`, tokenHash: `p-${suffix}`, expiresAt: new Date(now.getTime() + 86_400_000) },
        { ...base, email: `expired${ctx.domain}`, tokenHash: `e-${suffix}`, expiresAt: new Date(now.getTime() - 86_400_000) },
        { ...base, email: `revoked${ctx.domain}`, tokenHash: `r-${suffix}`, expiresAt: new Date(now.getTime() + 86_400_000), revokedAt: now },
      ],
    });
    const rows = await listOpenInvitations(ctx.space.id, now);
    expect(Object.fromEntries(rows.map((row) => [row.email, row.state]))).toEqual({ [`pending${ctx.domain}`]: "PENDING", [`expired${ctx.domain}`]: "EXPIRED" });
    expect(rows[0]?.invitedBy).toBe("Owner");
  });
});

describe("borrowing access", () => {
  it("needs a reason for anything but good standing, and audits the change", async () => {
    const refused = await setBorrowingStatus(prisma, { spaceId: ctx.space.id, membershipId: ctx.membership.id, status: "SUSPENDED", note: null, actorId: ctx.owner.id });
    expect(refused).toEqual({ ok: false, error: "Add a short reason the member will see." });
    const done = await setBorrowingStatus(prisma, { spaceId: ctx.space.id, membershipId: ctx.membership.id, status: "SUSPENDED", note: "Broke the rules", memberNumber: "TSK-200", actorId: ctx.owner.id });
    expect(done).toEqual({ ok: true });
    const [row] = await listMembersForAdmin(ctx.space.id, { q: "TSK-200" });
    expect(row).toMatchObject({ borrowingStatus: "SUSPENDED", borrowingNote: "Broke the rules", borrowingAuto: false, memberNumber: "TSK-200" });
    const audit = await prisma.auditEvent.findFirst({ where: { spaceId: ctx.space.id, action: "member.borrowing_changed", targetId: ctx.membership.id } });
    expect(audit?.metadata).toMatchObject({ from: "GOOD", to: "SUSPENDED", automatic: false });
    expect(await prisma.notification.count({ where: { userId: ctx.member.id, kind: "member.borrowing_changed" } })).toBe(1);
    await setBorrowingStatus(prisma, { spaceId: ctx.space.id, membershipId: ctx.membership.id, status: "GOOD", note: "ignored", actorId: ctx.owner.id });
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).borrowingNote).toBeNull();
  });

  it("can't reach a membership of another space", async () => {
    const result = await setBorrowingStatus(prisma, { spaceId: "another-space", membershipId: ctx.membership.id, status: "GOOD", note: null, actorId: ctx.owner.id });
    expect(result.ok).toBe(false);
  });
});

describe("roles", () => {
  // ctx.owner created the space, so it is the space's first inventory manager.
  const creator = () => prisma.membership.findUniqueOrThrow({ where: { userId_spaceId: { userId: ctx.owner.id, spaceId: ctx.space.id } } });

  it("never lets a space lose its last active inventory manager", async () => {
    const first = await creator();
    expect(first.role).toBe("MANAGER");
    expect(await changeMemberRole({ actor: first, membershipId: first.id, role: "STAFF" })).toEqual({ ok: false, error: LAST_MANAGER_ERROR });
    expect(await removeMember({ actor: first, membershipId: first.id })).toEqual({ ok: false, error: LAST_MANAGER_ERROR });

    // A suspended second manager doesn't count as active.
    const secondUser = await createUser(`second${ctx.domain}`, "Second manager");
    const second = await addMember(ctx.space.id, secondUser.id, "MANAGER");
    expect(await setMemberStatus({ actor: first, membershipId: second.id, status: "SUSPENDED" })).toEqual({ ok: true });
    expect(await removeMember({ actor: first, membershipId: first.id })).toEqual({ ok: false, error: LAST_MANAGER_ERROR });
    expect(await setMemberStatus({ actor: second, membershipId: first.id, status: "SUSPENDED" })).toEqual({ ok: false, error: LAST_MANAGER_ERROR });

    // With another active manager, either one may step down.
    expect(await setMemberStatus({ actor: first, membershipId: second.id, status: "ACTIVE" })).toEqual({ ok: true });
    expect(await changeMemberRole({ actor: second, membershipId: first.id, role: "STAFF" })).toEqual({ ok: true });
    expect(await changeMemberRole({ actor: second, membershipId: second.id, role: "MEMBER" })).toEqual({ ok: false, error: LAST_MANAGER_ERROR });
    expect(await changeMemberRole({ actor: second, membershipId: first.id, role: "MANAGER" })).toEqual({ ok: true });
    expect(await removeMember({ actor: second, membershipId: second.id })).toEqual({ ok: true });
    expect((await creator()).role).toBe("MANAGER");
  });

  it("keeps one manager when two managers demote each other at once", async () => {
    const first = await creator();
    const otherUser = await createUser(`race${ctx.domain}`, "Racing manager");
    const other = await addMember(ctx.space.id, otherUser.id, "MANAGER");
    const results = await Promise.all([
      changeMemberRole({ actor: first, membershipId: other.id, role: "STAFF" }),
      changeMemberRole({ actor: other, membershipId: first.id, role: "STAFF" }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await prisma.membership.count({ where: { spaceId: ctx.space.id, role: "MANAGER", status: "ACTIVE" } })).toBe(1);
    const survivor = await prisma.membership.findFirstOrThrow({ where: { spaceId: ctx.space.id, role: "MANAGER" } });
    const demoted = survivor.id === first.id ? other : first;
    expect(await changeMemberRole({ actor: survivor, membershipId: demoted.id, role: "MANAGER" })).toEqual({ ok: true });
    expect(await removeMember({ actor: first, membershipId: other.id })).toEqual({ ok: true });
  });

  it("lets inventory managers assign every role and manage other managers; staff manage no one", async () => {
    const manager = await creator();
    const otherManagerUser = await createUser(`manager2${ctx.domain}`, "Other manager");
    const otherManager = await addMember(ctx.space.id, otherManagerUser.id, "MANAGER");
    expect(await changeMemberRole({ actor: manager, membershipId: otherManager.id, role: "STAFF" })).toEqual({ ok: true });
    expect(await changeMemberRole({ actor: manager, membershipId: ctx.membership.id, role: "MANAGER" })).toEqual({ ok: true });
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).role).toBe("MANAGER");
    expect(await removeMember({ actor: manager, membershipId: ctx.membership.id })).toEqual({ ok: true });
    const staff = await prisma.membership.findUniqueOrThrow({ where: { userId_spaceId: { userId: ctx.staff.id, spaceId: ctx.space.id } } });
    expect(await changeMemberRole({ actor: staff, membershipId: otherManager.id, role: "MEMBER" })).toEqual({ ok: false, error: "You can't give that role." });
    expect(await removeMember({ actor: staff, membershipId: otherManager.id })).toEqual({ ok: false, error: "You can't remove this member." });
  });
});
