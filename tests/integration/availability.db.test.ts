import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import {
  adjustStock, applyCount, availabilityFor, availabilityOf, bringBackAsset, changeAssetState, moveStock, putBack,
  quarantineStock, receiveStock, releaseHolds, reserve, resolveQuarantine, takeAsset, takeFree, takeFromHolds, StockError,
} from "@/lib/inventory/availability";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const actor = { userId: null };

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

async function item(name: string, extra: Record<string, unknown> = {}) {
  return prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, ...extra }, actor));
}
const level = (itemId: string, locationId: string) => prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId } } });

describe("availability module", () => {
  it("receives stock, keeps a weighted average cost and writes the ledger", async () => {
    const resistor = await item("Resistor pack", { unitCostMinor: 100 });
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: resistor.id, locationId: ctx.shelfA.id, quantity: 10, unitCostMinor: 100 }, actor));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: resistor.id, locationId: ctx.shelfA.id, quantity: 10, unitCostMinor: 200 }, actor));
    expect((await level(resistor.id, ctx.shelfA.id)).onHand).toBe(20);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: resistor.id } })).avgCostMinor).toBe(150);
    expect(await prisma.stockMovement.count({ where: { itemId: resistor.id, type: "RECEIPT" } })).toBe(2);
  });

  it("never lets availability go below zero", async () => {
    const glue = await item("Glue stick");
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: glue.id, locationId: ctx.shelfA.id, quantity: 3 }, actor));
    await expect(prisma.$transaction((tx) => adjustStock(tx, { spaceId: ctx.space.id, itemId: glue.id, locationId: ctx.shelfA.id, delta: -4, reason: "CONSUMED" }, actor))).rejects.toBeInstanceOf(StockError);
    await expect(prisma.$transaction((tx) => takeFree(tx, { spaceId: ctx.space.id, itemId: glue.id, locationId: ctx.shelfB.id, quantity: 1, type: "ISSUE" }, actor))).rejects.toBeInstanceOf(StockError);
    // The database refuses a negative balance even if code tried to write one.
    await expect(prisma.stockLevel.update({ where: { itemId_locationId: { itemId: glue.id, locationId: ctx.shelfA.id } }, data: { onHand: -1 } })).rejects.toThrow();
    expect((await level(glue.id, ctx.shelfA.id)).onHand).toBe(3);
  });

  it("holds stock for a line, refuses over-reservation and releases cleanly", async () => {
    const drill = await item("Cordless drill");
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: drill.id, locationId: ctx.shelfA.id, quantity: 2 }, actor));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: drill.id, locationId: ctx.shelfB.id, quantity: 1 }, actor));
    const holds = await prisma.$transaction((tx) => reserve(tx, { spaceId: ctx.space.id, itemId: drill.id, quantity: 3, owner: { loanLineId: "line-1" } }, actor));
    expect(holds.reduce((sum, hold) => sum + hold.quantity, 0)).toBe(3);
    await expect(prisma.$transaction((tx) => reserve(tx, { spaceId: ctx.space.id, itemId: drill.id, quantity: 1, owner: { loanLineId: "line-2" } }, actor))).rejects.toThrow(/Only 0/);
    await expect(prisma.$transaction((tx) => adjustStock(tx, { spaceId: ctx.space.id, itemId: drill.id, locationId: ctx.shelfA.id, delta: -1, reason: "LOST" }, actor))).rejects.toThrow(/free/);
    const taken = await prisma.$transaction((tx) => takeFromHolds(tx, { spaceId: ctx.space.id, itemId: drill.id, quantity: 2, owner: { loanLineId: "line-1" }, type: "ISSUE" }, actor));
    expect(taken.reduce((sum, t) => sum + t.quantity, 0)).toBe(2);
    const totals = availabilityOf(await availabilityFor(ctx.space.id, [drill.id]), drill.id);
    expect(totals).toMatchObject({ onHand: 1, reserved: 0, available: 1 });
    expect(await prisma.stockReservation.count({ where: { loanLineId: "line-1" } })).toBe(0);
    expect(await prisma.$transaction((tx) => releaseHolds(tx, { spaceId: ctx.space.id, itemId: drill.id, owner: { loanLineId: "line-1" } }, actor))).toEqual([]);
  });

  it("puts damaged returns on the repair shelf and repairs or scraps them", async () => {
    const saw = await item("Hand saw");
    await prisma.$transaction((tx) => putBack(tx, { spaceId: ctx.space.id, itemId: saw.id, locationId: ctx.shelfA.id, good: 2, damaged: 2, type: "RETURN" }, actor));
    expect(await level(saw.id, ctx.shelfA.id)).toMatchObject({ onHand: 4, quarantined: 2 });
    await prisma.$transaction((tx) => resolveQuarantine(tx, { spaceId: ctx.space.id, itemId: saw.id, locationId: ctx.shelfA.id, quantity: 1, outcome: "repair" }, actor));
    await prisma.$transaction((tx) => resolveQuarantine(tx, { spaceId: ctx.space.id, itemId: saw.id, locationId: ctx.shelfA.id, quantity: 1, outcome: "scrap" }, actor));
    expect(await level(saw.id, ctx.shelfA.id)).toMatchObject({ onHand: 3, quarantined: 0 });
    await prisma.$transaction((tx) => quarantineStock(tx, { spaceId: ctx.space.id, itemId: saw.id, locationId: ctx.shelfA.id, quantity: 3 }, actor));
    await expect(prisma.$transaction((tx) => moveStock(tx, { spaceId: ctx.space.id, itemId: saw.id, fromLocationId: ctx.shelfA.id, toLocationId: ctx.shelfB.id, quantity: 1 }, actor))).rejects.toBeInstanceOf(StockError);
  });

  it("tracks serialized assets one by one through issue and return", async () => {
    const scope = await item("Oscilloscope", { tracking: "SERIALIZED" });
    const [first, second] = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: scope.id, locationId: ctx.shelfA.id, serialNumbers: ["S1", "S2"] }, actor));
    expect(first!.assetTag).toMatch(/-0000\d\d$/);
    await prisma.$transaction((tx) => reserve(tx, { spaceId: ctx.space.id, itemId: scope.id, quantity: 1, owner: { loanLineId: "scope-line" } }, actor));
    // One unit is held, so only one asset can leave without releasing the hold.
    await prisma.$transaction((tx) => takeAsset(tx, { spaceId: ctx.space.id, assetId: first!.id, itemId: scope.id, to: "ON_LOAN", type: "ISSUE" }, actor));
    await expect(prisma.$transaction((tx) => takeAsset(tx, { spaceId: ctx.space.id, assetId: second!.id, itemId: scope.id, to: "ON_LOAN", type: "ISSUE" }, actor))).rejects.toThrow(/held/);
    await prisma.$transaction((tx) => bringBackAsset(tx, { assetId: first!.id, spaceId: ctx.space.id, itemId: scope.id, locationId: ctx.shelfB.id, outcome: "damaged", type: "RETURN", expect: "ON_LOAN" }, actor));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: first!.id } })).toMatchObject({ status: "MAINTENANCE", locationId: ctx.shelfB.id });
    await prisma.$transaction((tx) => changeAssetState(tx, { spaceId: ctx.space.id, assetId: first!.id, action: "repair" }, actor));
    expect(await level(scope.id, ctx.shelfB.id)).toMatchObject({ onHand: 1, quarantined: 0 });
  });

  it("posts counts only against an unchanged snapshot", async () => {
    const tape = await item("Tape measure");
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfA.id, quantity: 5 }, actor));
    await expect(prisma.$transaction((tx) => applyCount(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfA.id, expected: 4, counted: 3 }, actor))).rejects.toThrow(/Recount/);
    expect(await prisma.$transaction((tx) => applyCount(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfA.id, expected: 5, counted: 3 }, actor))).toBe(-2);
    expect((await level(tape.id, ctx.shelfA.id)).onHand).toBe(3);
  });

  it("raises one low-stock alert when stock falls to the reorder point and re-arms on recovery", async () => {
    const solder = await item("Solder wire", { reorderPoint: 2 });
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: solder.id, locationId: ctx.shelfA.id, quantity: 5 }, actor));
    await prisma.$transaction((tx) => adjustStock(tx, { spaceId: ctx.space.id, itemId: solder.id, locationId: ctx.shelfA.id, delta: -3, reason: "CONSUMED" }, actor));
    await prisma.$transaction((tx) => adjustStock(tx, { spaceId: ctx.space.id, itemId: solder.id, locationId: ctx.shelfA.id, delta: -1, reason: "CONSUMED" }, actor));
    const notes = await prisma.notification.count({ where: { spaceId: ctx.space.id, kind: "stock.low" } });
    expect(notes).toBe(1);
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: solder.id, locationId: ctx.shelfA.id, quantity: 10 }, actor));
    expect((await prisma.item.findUniqueOrThrow({ where: { id: solder.id } })).lowStockAlertAt).toBeNull();
  });

  it("serialises concurrent takes so only the free units leave", async () => {
    const tip = await item("Soldering tip");
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: tip.id, locationId: ctx.shelfA.id, quantity: 3 }, actor));
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => prisma.$transaction((tx) => takeFree(tx, { spaceId: ctx.space.id, itemId: tip.id, locationId: ctx.shelfA.id, quantity: 1, type: "ISSUE" }, actor))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect((await level(tip.id, ctx.shelfA.id)).onHand).toBe(0);
  });
});
