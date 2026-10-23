import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { setBorrowingStatus } from "@/lib/lending/access";
import { changeMemberRole } from "@/lib/membership";
import { listMembersForAdmin, listOpenInvitations } from "@/lib/setup/members";
import { addMember, cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

describe("members list", () => {
  it("lists every member with role, standing, member number and counts", async () => {
    const rows = await listMembersForAdmin(ctx.space.id);
    expect(rows.map((row) => row.role)).toEqual(["OWNER", "STAFF", "MEMBER"]);
    const member = rows.find((row) => row.userId === ctx.member.id)!;
    expect(member).toMatchObject({ email: ctx.member.email, borrowingStatus: "GOOD", memberNumber: null, activeLoans: 0, openIncidents: 0, status: "ACTIVE" });
  });

  it("filters by search text and role", async () => {
    await prisma.membership.update({ where: { id: ctx.membership.id }, data: { memberNumber: "TSK-118" } });
    expect((await listMembersForAdmin(ctx.space.id, { q: "tsk-11" })).map((row) => row.userId)).toEqual([ctx.member.id]);
    expect((await listMembersForAdmin(ctx.space.id, { q: `staff${ctx.domain}` })).map((row) => row.userId)).toEqual([ctx.staff.id]);
    expect((await listMembersForAdmin(ctx.space.id, { role: "OWNER" })).map((row) => row.userId)).toEqual([ctx.owner.id]);
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
  it("admins assign roles below admin only; owners may make admins", async () => {
    const adminUser = await createUser(`admin${ctx.domain}`, "Admin");
    const admin = await addMember(ctx.space.id, adminUser.id, "ADMIN");
    expect(await changeMemberRole({ actor: admin, membershipId: ctx.membership.id, role: "ADMIN" })).toEqual({ ok: false, error: "You can't give that role." });
    expect(await changeMemberRole({ actor: admin, membershipId: ctx.membership.id, role: "MANAGER" })).toEqual({ ok: true });
    const owner = await prisma.membership.findUniqueOrThrow({ where: { userId_spaceId: { userId: ctx.owner.id, spaceId: ctx.space.id } } });
    expect(await changeMemberRole({ actor: admin, membershipId: owner.id, role: "MEMBER" })).toMatchObject({ ok: false });
    expect(await changeMemberRole({ actor: owner, membershipId: ctx.membership.id, role: "ADMIN" })).toEqual({ ok: true });
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).role).toBe("ADMIN");
  });
});
