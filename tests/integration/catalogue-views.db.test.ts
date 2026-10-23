import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createItem } from "@/lib/catalogue/items";
import { listItems, loadMovements, movementWhere, parseItemFilters, parseMovementFilters } from "@/lib/catalogue/views";
import { prisma } from "@/lib/db";
import { adjustStock, receiveStock } from "@/lib/inventory/availability";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let solder: { id: string };
let tape: { id: string };

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  const actor = { userId: ctx.owner.id };
  solder = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Solder wire", tags: ["electronics"], reorderPoint: 5, unitCostMinor: 200 }, actor));
  tape = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Masking tape", sku: "TAPE-1", lendable: true }, actor));
  await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: solder.id, locationId: ctx.shelfA.id, quantity: 4, unitCostMinor: 200 }, actor));
  await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfB.id, quantity: 10 }, actor));
  await prisma.$transaction((tx) => adjustStock(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfB.id, delta: -2, reason: "CONSUMED" }, actor, { refType: "Adjustment", note: "Used for a workshop" }));
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

const names = async (params: Record<string, string>) => (await listItems(ctx.space.id, parseItemFilters(params))).rows.map((row) => row.name);

describe("items read model", () => {
  it("searches names, SKUs and tags and filters by lending and low stock", async () => {
    expect(await names({})).toEqual(["Masking tape", "Solder wire"]);
    expect(await names({ q: "tape-1" })).toEqual(["Masking tape"]);
    expect(await names({ q: "electronics" })).toEqual(["Solder wire"]);
    expect(await names({ lendable: "yes" })).toEqual(["Masking tape"]);
    expect(await names({ low: "1" })).toEqual(["Solder wire"]);
  });

  it("totals stock and values it at average cost", async () => {
    const { rows, total, pageCount } = await listItems(ctx.space.id, parseItemFilters({ q: "solder" }));
    expect({ total, pageCount }).toEqual({ total: 1, pageCount: 1 });
    expect(rows[0]).toMatchObject({ onHand: 4, available: 4, onLoan: 0, low: true, valueMinor: 800, tracking: "QUANTITY" });
  });

  it("hides archived items unless asked", async () => {
    const old = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name: "Old glue" }, { userId: null }));
    await prisma.item.update({ where: { id: old.id }, data: { archivedAt: new Date() } });
    expect(await names({ q: "glue" })).toEqual([]);
    expect(await names({ q: "glue", archived: "1" })).toEqual(["Old glue"]);
  });
});

describe("ledger read model", () => {
  it("filters by type and item and resolves locations and people", async () => {
    const where = await movementWhere(ctx.space.id, parseMovementFilters({ type: "ADJUSTMENT", item: tape.id }), ctx.space.timezone);
    const rows = await loadMovements(ctx.space.id, ctx.space.slug, where, { take: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ quantity: -2, balanceAfter: 8, reason: "CONSUMED", note: "Used for a workshop", location: "Shelf B (R1-B)", actor: "Owner", ref: null });
  });

  it("filters by date range in the space time zone and pages with a cursor", async () => {
    const all = await movementWhere(ctx.space.id, parseMovementFilters({}), ctx.space.timezone);
    const first = await loadMovements(ctx.space.id, ctx.space.slug, all, { take: 2 });
    const rest = await loadMovements(ctx.space.id, ctx.space.slug, all, { take: 10, cursor: first.at(-1)!.id });
    expect(first.length + rest.length).toBe(3);
    expect(new Set([...first, ...rest].map((row) => row.id)).size).toBe(3);
    const future = await movementWhere(ctx.space.id, parseMovementFilters({ from: "2999-01-01" }), ctx.space.timezone);
    expect(await prisma.stockMovement.count({ where: future })).toBe(0);
  });

  it("resolves loan references and matches nothing for unknown ones", async () => {
    const loan = await prisma.loan.create({ data: { spaceId: ctx.space.id, number: 42, borrowerId: ctx.member.id, dueAt: new Date(), status: "REQUESTED" } });
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: tape.id, locationId: ctx.shelfA.id, quantity: 1 }, { userId: null }, { refType: "Loan", refId: loan.id }));
    const where = await movementWhere(ctx.space.id, parseMovementFilters({ ref: "LN-0042" }), ctx.space.timezone);
    const rows = await loadMovements(ctx.space.id, ctx.space.slug, where, { take: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ref).toEqual({ label: "LN-0042", href: `/s/${ctx.space.slug}/loans/${loan.id}` });
    expect(rows[0]!.actor).toBe("System");
    const none = await movementWhere(ctx.space.id, parseMovementFilters({ ref: "LN-9999" }), ctx.space.timezone);
    expect(await prisma.stockMovement.count({ where: none })).toBe(0);
  });
});
