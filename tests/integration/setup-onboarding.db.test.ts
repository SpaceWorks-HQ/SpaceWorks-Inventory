import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { receiveStock } from "@/lib/inventory/availability";
import { requestLoan } from "@/lib/lending/workflow";
import { memberHome, staffHome } from "@/lib/setup/home";
import { addCategories, completeSetup, createLocationPlan, setupProgress } from "@/lib/setup/onboarding";
import { joinSpace, publicCatalogue } from "@/lib/setup/publicCatalogue";
import { findQrTarget, resolveQrLanding } from "@/lib/setup/qrLanding";
import { planLocations } from "@/lib/setup/wizard";
import { addMember, cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
const other = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let b: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  b = await seedSpace(other);
});
afterAll(async () => {
  await cleanup([ctx.space.slug], ctx.domain);
  await cleanup([b.space.slug], b.domain);
});

describe("setup wizard helpers", () => {
  it("creates a nested location plan in order and refuses codes already in use", async () => {
    const rows = planLocations({ buildingName: "Main building", buildingCode: "MB", rooms: [{ name: "Workshop", shelves: 2, binsPerShelf: 1 }] });
    const result = await prisma.$transaction((tx) => createLocationPlan(tx, ctx.space.id, rows, { userId: ctx.owner.id }));
    expect(result.created).toBe(rows.length);
    const bin = await prisma.location.findFirstOrThrow({ where: { spaceId: ctx.space.id, code: "MB-R1-S2-B1" }, select: { kind: true, parent: { select: { code: true, parent: { select: { code: true } } } } } });
    expect(bin).toMatchObject({ kind: "BIN", parent: { code: "MB-R1-S2", parent: { code: "MB-R1" } } });
    await expect(prisma.$transaction((tx) => createLocationPlan(tx, ctx.space.id, rows.slice(0, 1), { userId: ctx.owner.id }))).rejects.toThrow(/already used/);
    expect(await prisma.location.count({ where: { spaceId: ctx.space.id, code: { startsWith: "MB" } } })).toBe(rows.length);
  });

  it("adds categories once, ignoring ones the space already has", async () => {
    const first = await prisma.$transaction((tx) => addCategories(tx, ctx.space.id, ["Hand tools", "Electronics", "hand tools"], { userId: ctx.owner.id }));
    expect(first.created).toBe(2);
    const again = await prisma.$transaction((tx) => addCategories(tx, ctx.space.id, ["Electronics", "Safety gear"], { userId: ctx.owner.id }));
    expect(again.created).toBe(1);
    const progress = await setupProgress(ctx.space.id);
    expect(progress.categories.map((c) => c.name)).toEqual(["Electronics", "Hand tools", "Safety gear"]);
    expect(progress.units.length).toBeGreaterThan(0);
  });

  it("finishes setup with an audit row and can finish again", async () => {
    await prisma.$transaction((tx) => completeSetup(tx, ctx.space.id, { userId: ctx.owner.id }));
    expect((await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } })).setupCompletedAt).not.toBeNull();
    await prisma.$transaction((tx) => completeSetup(tx, ctx.space.id, { userId: ctx.owner.id }));
    const audits = await prisma.auditEvent.findMany({ where: { spaceId: ctx.space.id, action: "space.setup_completed" }, orderBy: { createdAt: "asc" } });
    expect(audits.map((a) => (a.metadata as { again: boolean }).again)).toEqual([false, true]);
  });
});

describe("space home", () => {
  it("counts the desk queue for staff and the member's own requests", async () => {
    const drill = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Cordless drill", lendable: true }, system));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: drill.id, locationId: ctx.shelfA.id, quantity: 2 }, system));
    await prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, lines: [{ itemId: drill.id, quantity: 1 }], purpose: null, neededFrom: null }, { userId: ctx.member.id }));
    const staff = await staffHome({ id: ctx.space.id, timezone: ctx.space.timezone });
    expect(staff.stats).toMatchObject({ requested: 1, overdue: 0, dueToday: 0 });
    expect(staff.requests[0]).toMatchObject({ borrower: "Member", items: "Cordless drill" });
    expect(staff.movements[0]).toMatchObject({ type: "RECEIPT", quantity: 2, itemName: "Cordless drill" });
    const member = await memberHome(ctx.space.id, ctx.member.id);
    expect(member).toMatchObject({ standing: { status: "GOOD" }, overdue: 0 });
    expect(member.pending).toHaveLength(1);
    expect(member.active).toHaveLength(0);
  });
});

describe("public catalogue, self-join and QR landing", () => {
  it("is hidden until published and lists only lendable items with words, not counts", async () => {
    const pliers = await prisma.$transaction((tx) => createItem(tx, b.space.id, { name: "Pliers", lendable: true }, system));
    const solder = await prisma.$transaction((tx) => createItem(tx, b.space.id, { name: "Solder", lendable: false }, system));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: b.space.id, itemId: pliers.id, locationId: b.shelfA.id, quantity: 4 }, system));
    expect(await publicCatalogue(b.space.slug)).toBeNull();
    await prisma.space.update({ where: { id: b.space.id }, data: { publicCatalogue: true } });
    const catalogue = await publicCatalogue(b.space.slug);
    expect(catalogue?.items.map((item) => [item.name, item.availability])).toEqual([["Pliers", "Available"]]);
    expect(JSON.stringify(catalogue)).not.toContain(solder.id);
    expect(JSON.stringify(catalogue?.items)).not.toMatch(/"(sku|available|onHand)"/);
    expect(await publicCatalogue("no-such-space-" + other)).toBeNull();
  });

  it("lets signed-in accounts join only when the space allows self-join", async () => {
    const visitor = await createUser(`visitor${b.domain}`, "Visitor");
    await expect(prisma.$transaction((tx) => joinSpace(tx, b.space.slug, visitor.id))).rejects.toThrow(/isn't open/);
    await prisma.space.update({ where: { id: b.space.id }, data: { selfJoin: true } });
    expect(await prisma.$transaction((tx) => joinSpace(tx, b.space.slug, visitor.id))).toEqual({ slug: b.space.slug, joined: true });
    expect(await prisma.$transaction((tx) => joinSpace(tx, b.space.slug, visitor.id))).toEqual({ slug: b.space.slug, joined: false });
    expect(await prisma.membership.findUniqueOrThrow({ where: { userId_spaceId: { userId: visitor.id, spaceId: b.space.id } } })).toMatchObject({ role: "MEMBER", status: "ACTIVE" });
    expect(await prisma.auditEvent.count({ where: { spaceId: b.space.id, action: "member.joined", actorId: visitor.id } })).toBe(1);
  });

  it("resolves codes across the install without revealing private spaces", async () => {
    const meter = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Multimeter", lendable: true }, system));
    expect(await findQrTarget(meter.qrCode)).toMatchObject({ kind: "item", id: meter.id, spaceId: ctx.space.id });
    expect(await resolveQrLanding(meter.qrCode, ctx.staff.id)).toEqual({ type: "redirect", url: `/s/${ctx.space.slug}/items/${meter.id}` });
    expect(await resolveQrLanding(meter.qrCode, ctx.member.id)).toEqual({ type: "redirect", url: `/s/${ctx.space.slug}/catalogue?item=${meter.id}` });
    const neutral = await resolveQrLanding(meter.qrCode, b.owner.id);
    expect(neutral).toEqual(await resolveQrLanding("IZZZZZZZZZZZZZZZ", b.owner.id));
    expect(neutral).toEqual({ type: "neutral", signedIn: true });
    expect(await resolveQrLanding(meter.qrCode, null)).toEqual({ type: "neutral", signedIn: false });
    await prisma.space.update({ where: { id: ctx.space.id }, data: { publicCatalogue: true } });
    expect(await resolveQrLanding(meter.qrCode, null)).toEqual({ type: "redirect", url: `/c/${ctx.space.slug}?item=${meter.id}` });
    expect(await resolveQrLanding(ctx.shelfA.qrCode, null)).toEqual({ type: "neutral", signedIn: false });
    const suspended = await addMember(ctx.space.id, (await createUser(`gone${ctx.domain}`)).id, "STAFF");
    await prisma.membership.update({ where: { id: suspended.id }, data: { status: "SUSPENDED" } });
    expect(await resolveQrLanding(ctx.shelfA.qrCode, suspended.userId)).toEqual({ type: "neutral", signedIn: true });
  });
});
