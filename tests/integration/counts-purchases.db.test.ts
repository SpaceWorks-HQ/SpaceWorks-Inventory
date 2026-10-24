import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { receiveStock } from "@/lib/inventory/availability";
import { postCount, recordCountedQuantity, refreshCountLine, reopenCount, runCountSchedules, saveCountSchedule, scanCountAsset, startCount, submitCount } from "@/lib/counts";
import { createPurchase, movePurchase, receivePurchase, reorderSuggestions } from "@/lib/purchases";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

const level = (itemId: string, locationId: string) => prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId } } });

describe("cycle counts", () => {
  it("posts counted quantities with four-eyes above the threshold and refuses stale lines", async () => {
    const pliers = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Pliers" }, system));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: pliers.id, locationId: ctx.shelfA.id, quantity: 10 }, system));
    const count = await prisma.$transaction((tx) => startCount(tx, { spaceId: ctx.space.id, name: "Shelf A", locationId: ctx.room.id, categoryId: null, blind: true, actorId: ctx.staff.id }));
    const line = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: count.id, itemId: pliers.id } });
    expect(line.expectedQty).toBe(10);
    await prisma.$transaction((tx) => recordCountedQuantity(tx, { spaceId: ctx.space.id, countId: count.id, lineId: line.id, counted: 8, note: null, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => submitCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.staff.id }));
    await expect(prisma.$transaction((tx) => postCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.staff.id }))).rejects.toThrow(/didn't count/);
    // Stock moves before posting: the line is stale until it is recounted.
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: pliers.id, locationId: ctx.shelfA.id, quantity: 1 }, system));
    await expect(prisma.$transaction((tx) => postCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.owner.id }))).rejects.toThrow(/Recount/);
    await prisma.$transaction((tx) => reopenCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.owner.id }));
    await prisma.$transaction((tx) => refreshCountLine(tx, { spaceId: ctx.space.id, countId: count.id, lineId: line.id }));
    await prisma.$transaction((tx) => recordCountedQuantity(tx, { spaceId: ctx.space.id, countId: count.id, lineId: line.id, counted: 9, note: "Two in the bin", actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => submitCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => postCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.owner.id }));
    expect((await level(pliers.id, ctx.shelfA.id)).onHand).toBe(9);
    expect(await prisma.stockMovement.count({ where: { itemId: pliers.id, type: "COUNT" } })).toBe(1);
  });

  it("counts serialized items by scanning: missing tags become lost, misplaced ones move", async () => {
    const meter = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Multimeter", tracking: "SERIALIZED" }, system));
    const [m1, m2, m3] = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: meter.id, locationId: ctx.shelfA.id, count: 3 }, system));
    const count = await prisma.$transaction((tx) => startCount(tx, { spaceId: ctx.space.id, name: "Meters", locationId: null, categoryId: null, blind: true, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => scanCountAsset(tx, { spaceId: ctx.space.id, countId: count.id, code: m1!.qrCode, locationId: ctx.shelfA.id, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => scanCountAsset(tx, { spaceId: ctx.space.id, countId: count.id, code: m2!.qrCode, locationId: ctx.shelfB.id, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => submitCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.staff.id }));
    await prisma.$transaction((tx) => postCount(tx, { spaceId: ctx.space.id, countId: count.id, actorId: ctx.owner.id }));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: m2!.id } })).toMatchObject({ status: "AVAILABLE", locationId: ctx.shelfB.id });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: m3!.id } })).toMatchObject({ status: "LOST" });
    expect((await level(meter.id, ctx.shelfA.id)).onHand).toBe(1);
  });

  it("opens one count per due schedule, even after missed runs", async () => {
    const id = await prisma.$transaction((tx) => saveCountSchedule(tx, { spaceId: ctx.space.id, actorId: ctx.owner.id, scheduleId: null, name: "Monthly bins", locationId: ctx.shelfB.id, categoryId: null, everyDays: 30, blind: true, active: true, firstRunAt: new Date(Date.now() - 95 * 86_400_000) }));
    await runCountSchedules();
    await runCountSchedules();
    expect(await prisma.stockCount.count({ where: { spaceId: ctx.space.id, name: "Monthly bins (scheduled)" } })).toBe(1);
    expect((await prisma.countSchedule.findUniqueOrThrow({ where: { id } })).nextRunAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe("to buy", () => {
  it("suggests reorders and receives purchases into stock at the purchase cost", async () => {
    const pla = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "PLA filament", reorderPoint: 2, reorderQuantity: 5 }, system));
    expect((await reorderSuggestions(ctx.space.id)).map((i) => i.id)).toContain(pla.id);
    const supplier = await prisma.supplier.create({ data: { spaceId: ctx.space.id, name: "Filament shop" } });
    const payment = { amountMinor: 600000, method: "BANK_TRANSFER" as const, reference: "INV-1", supplierId: supplier.id };
    const purchase = await prisma.$transaction((tx) => createPurchase(tx, { spaceId: ctx.space.id, itemId: pla.id, name: "", quantity: 5, supplierId: null, unitCostMinor: 120000, link: null, note: null }, { userId: ctx.staff.id }));
    await prisma.$transaction((tx) => movePurchase(tx, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "approve" }, { userId: ctx.owner.id }));
    await prisma.$transaction((tx) => movePurchase(tx, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "order", payment }, { userId: ctx.owner.id }));
    await prisma.$transaction((tx) => receivePurchase(tx, { spaceId: ctx.space.id, purchaseId: purchase.id, locationId: ctx.shelfB.id, quantity: 4, unitCostMinor: null }, { userId: ctx.staff.id }));
    expect((await level(pla.id, ctx.shelfB.id)).onHand).toBe(4);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: pla.id } })).avgCostMinor).toBe(120000);
    await expect(prisma.$transaction((tx) => movePurchase(tx, { spaceId: ctx.space.id, purchaseId: purchase.id, step: "cancel" }, { userId: ctx.owner.id }))).rejects.toThrow(/can't move/);
    const fresh = await prisma.$transaction((tx) => createPurchase(tx, { spaceId: ctx.space.id, itemId: null, name: "Laser cutter lens", quantity: 1, supplierId: null, unitCostMinor: 500000, link: "https://example.test/lens", note: null }, { userId: ctx.staff.id }));
    await prisma.$transaction((tx) => movePurchase(tx, { spaceId: ctx.space.id, purchaseId: fresh.id, step: "approve" }, { userId: ctx.owner.id }));
    const { itemId } = await prisma.$transaction((tx) => receivePurchase(tx, { spaceId: ctx.space.id, purchaseId: fresh.id, locationId: ctx.shelfA.id, quantity: null, unitCostMinor: null, tracking: "SERIALIZED", payment: { ...payment, amountMinor: 500000 } }, { userId: ctx.staff.id }));
    expect(await prisma.asset.count({ where: { itemId } })).toBe(1);
  });
});
