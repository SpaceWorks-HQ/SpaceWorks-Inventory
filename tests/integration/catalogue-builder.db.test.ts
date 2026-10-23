import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildHierarchy } from "@/lib/catalogue/builder";
import { setLocationArchived } from "@/lib/catalogue/locations";
import { descendantIds } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const actor = { userId: null };

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

describe("location quick builder", () => {
  it("creates a building, rooms and shelves in one go with generated codes and an audit", async () => {
    const built = await prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, { buildingName: "Main building", rooms: 2, shelvesPerRoom: 3 }, actor));
    expect(built).toMatchObject({ buildingCode: "B1", count: 9 });
    const rows = await prisma.location.findMany({ where: { spaceId: ctx.space.id, code: { startsWith: "B1" } }, include: { parent: { select: { code: true } } } });
    const byCode = new Map(rows.map((row) => [row.code, row]));
    expect(rows).toHaveLength(9);
    expect(byCode.get("B1")).toMatchObject({ kind: "BUILDING", name: "Main building", parentId: null });
    expect(byCode.get("B1-R2")).toMatchObject({ kind: "ROOM", name: "Room 2" });
    expect(byCode.get("B1-R2")!.parent?.code).toBe("B1");
    expect(byCode.get("B1-R2-S3")!.parent?.code).toBe("B1-R2");
    expect(new Set(rows.map((row) => row.qrCode)).size).toBe(9);
    expect(await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "location.built", targetId: built.buildingId } })).toBe(1);
    expect((await descendantIds(ctx.space.id, built.buildingId)).sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it("picks the next free number, nests under a parent and refuses clashing codes", async () => {
    const next = await prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, { buildingName: "Annexe", rooms: 1, shelvesPerRoom: 0, parentId: ctx.room.id }, actor));
    expect(next.buildingCode).toBe("B2");
    expect((await prisma.location.findUniqueOrThrow({ where: { id: next.buildingId } })).parentId).toBe(ctx.room.id);
    const before = await prisma.location.count({ where: { spaceId: ctx.space.id } });
    await expect(prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, { buildingName: "Again", buildingCode: "B1", rooms: 1, shelvesPerRoom: 1 }, actor))).rejects.toThrow(/already used/);
    expect(await prisma.location.count({ where: { spaceId: ctx.space.id } })).toBe(before);
  });

  it("refuses an archived or foreign parent", async () => {
    const built = await prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, { buildingName: "Store", buildingCode: "ST", rooms: 1, shelvesPerRoom: 0 }, actor));
    const room = await prisma.location.findFirstOrThrow({ where: { spaceId: ctx.space.id, code: "ST-R1" } });
    await prisma.$transaction((tx) => setLocationArchived(tx, ctx.space.id, room.id, true, actor));
    await expect(prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, { buildingName: "X", rooms: 1, shelvesPerRoom: 0, parentId: room.id }, actor))).rejects.toThrow(/isn't archived/);
    const other = await seedSpace(uniqueSuffix());
    try {
      await expect(prisma.$transaction((tx) => buildHierarchy(tx, other.space.id, { buildingName: "X", rooms: 1, shelvesPerRoom: 0, parentId: built.buildingId }, actor))).rejects.toThrow(/wasn't found/);
    } finally {
      await cleanup([other.space.slug], other.domain);
    }
  });
});
