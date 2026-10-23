import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { receiveStock } from "@/lib/inventory/availability";
import { countDetail } from "@/lib/desk/countsDetail";
import { postCount, recordCountedQuantity, saveCountSchedule, scanCountAsset, startCount, submitCount } from "@/lib/counts";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

let ctx: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };
beforeAll(async () => { ctx = await seedSpace(uniqueSuffix()); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

async function serialised(name: string, count: number) {
  const item = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, tracking: "SERIALIZED" }, system));
  const assets = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: item.id, locationId: ctx.shelfA.id, count }, system));
  return { item, assets };
}
const start = () => prisma.$transaction((tx) => startCount(tx, { spaceId: ctx.space.id, name: "Regression count", locationId: ctx.shelfA.id, categoryId: null, blind: false, actorId: ctx.staff.id }));
const lineOf = (countId: string, itemId: string) => prisma.stockCountLine.findFirstOrThrow({ where: { countId, itemId } });
const record = (countId: string, lineId: string, counted: number) => prisma.$transaction((tx) => recordCountedQuantity(tx, { spaceId: ctx.space.id, countId, lineId, counted, note: null, actorId: ctx.staff.id }));
async function submit(countId: string) {
  await prisma.$transaction((tx) => submitCount(tx, { spaceId: ctx.space.id, countId, actorId: ctx.staff.id }));
}
const post = (countId: string) => prisma.$transaction((tx) => postCount(tx, { spaceId: ctx.space.id, countId, actorId: ctx.owner.id }));

describe("serialised count regressions", () => {
  it("leaves untouched serialised lines alone when a mixed count is posted", async () => {
    const { item, assets } = await serialised("Untouched drills", 2);
    const tape = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Counted tape" }, system));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfA.id, quantity: 3 }, system));
    const count = await start();
    await record(count.id, (await lineOf(count.id, tape.id)).id, 3);
    await submit(count.id);
    const preview = (await countDetail(ctx.space.id, count.id, ctx.staff.id))!;
    expect(preview).toMatchObject({ missingTools: 0, fourEyes: { blocked: false } });
    expect(preview.lines.find((line) => line.itemId === item.id)).toMatchObject({ variance: null, countedQty: null });
    await post(count.id);
    expect(await prisma.asset.findMany({ where: { spaceId: ctx.space.id, id: { in: assets.map((asset) => asset.id) } }, select: { status: true, locationId: true } }))
      .toEqual(assets.map(() => ({ status: "AVAILABLE", locationId: ctx.shelfA.id })));
    expect(await prisma.stockMovement.count({ where: { spaceId: ctx.space.id, itemId: item.id, refId: count.id } })).toBe(0);
  });

  it("marks explicitly counted zero-found assets missing and previews the exact number", async () => {
    const { item, assets } = await serialised("Missing meters", 2);
    const count = await start();
    const line = await lineOf(count.id, item.id);
    await record(count.id, line.id, 0);
    await submit(count.id);
    expect((await countDetail(ctx.space.id, count.id, ctx.owner.id))!.missingTools).toBe(2);
    await post(count.id);
    expect(await prisma.asset.count({ where: { spaceId: ctx.space.id, id: { in: assets.map((asset) => asset.id) }, status: "LOST" } })).toBe(2);
    expect(await prisma.stockCountLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ expectedQty: 2, countedQty: 0 });
  });

  it("persists posted expected and found quantities so later stock changes cannot alter variance", async () => {
    const { item, assets } = await serialised("Historical saws", 3);
    const count = await start();
    for (const asset of assets.slice(0, 2)) {
      await prisma.$transaction((tx) => scanCountAsset(tx, { spaceId: ctx.space.id, countId: count.id, code: asset.qrCode, locationId: ctx.shelfA.id, actorId: ctx.staff.id }));
    }
    const line = await lineOf(count.id, item.id);
    await expect(record(count.id, line.id, 3)).rejects.toThrow(/Scan each tag/);
    await record(count.id, line.id, 2);
    await submit(count.id);
    expect((await countDetail(ctx.space.id, count.id, ctx.owner.id))!.missingTools).toBe(1);
    await post(count.id);
    const stored = await lineOf(count.id, item.id);
    expect(stored).toMatchObject({ expectedQty: 3, countedQty: 2 });
    const before = (await countDetail(ctx.space.id, count.id, ctx.owner.id))!.lines.find((row) => row.id === line.id)!;
    expect(before).toMatchObject({ expected: 3, countedQty: 2, variance: -1 });
    await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: item.id, locationId: ctx.shelfA.id, count: 2 }, system));
    expect((await countDetail(ctx.space.id, count.id, ctx.owner.id))!.lines.find((row) => row.id === line.id)).toEqual(before);
  });

  it("keeps a saved serialised total equal to the scans when a tag is scanned afterwards", async () => {
    const { item, assets } = await serialised("Late scanned clamps", 2);
    const count = await start();
    const line = await lineOf(count.id, item.id);
    await record(count.id, line.id, 0);
    await prisma.$transaction((tx) => scanCountAsset(tx, { spaceId: ctx.space.id, countId: count.id, code: assets[0]!.qrCode, locationId: ctx.shelfA.id, actorId: ctx.staff.id }));
    expect(await lineOf(count.id, item.id)).toMatchObject({ countedQty: 1 });
  });
});

it("rolls a schedule and its audit event back together", async () => {
  const before = await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "count.schedule_created" } });
  await expect(prisma.$transaction(async (tx) => {
    await saveCountSchedule(tx, { spaceId: ctx.space.id, actorId: ctx.owner.id, scheduleId: null, name: "Rolled back schedule", locationId: null, categoryId: null, everyDays: 7, blind: false, active: true, firstRunAt: new Date() });
    throw new Error("Roll back");
  })).rejects.toThrow("Roll back");
  expect(await prisma.countSchedule.count({ where: { spaceId: ctx.space.id, name: "Rolled back schedule" } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "count.schedule_created" } })).toBe(before);
});
