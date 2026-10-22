import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { applyImportJob, importJobView, IMPORT_KINDS, previewImport, type ImportKind } from "@/lib/importer";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let actor: { userId: string };
let resistor: { id: string };
let meter: { id: string };
const off = { createMissing: false, updateExisting: false };

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  // Asset tags are unique across the install: give this space its own prefix.
  ctx.space = await prisma.space.update({ where: { id: ctx.space.id }, data: { tagPrefix: `I${suffix.slice(0, 4).toUpperCase()}` } });
  actor = { userId: ctx.owner.id };
  resistor = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { sku: "RES", name: "Resistor pack", consumable: true }, actor));
  meter = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { sku: "DMM", name: "Multimeter", tracking: "SERIALIZED", lendable: true, unitCostMinor: 150000 }, actor));
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

const preview = (kind: ImportKind, csv: string | Buffer, fileName = `${kind}.csv`, options = off) =>
  previewImport(ctx.space, actor, { kind, fileName, bytes: typeof csv === "string" ? Buffer.from(csv) : csv, options });
const apply = (jobId: string) => prisma.$transaction((tx) => applyImportJob(tx, ctx.space, jobId, actor), { timeout: 60_000 });

describe("importing stock", () => {
  it("receives quantity stock through the availability module with an Import ledger reference", async () => {
    const csv = "SKU,Location,Qty,Unit cost\nRES,r1-a,10,2.50\nRES,R1-B,5,\nDMM,R1-A,1,\nRES,NOWHERE,1,\nRES,R1-A,0,\n";
    const { jobId, stats } = await preview("stock", csv);
    expect(stats).toEqual({ total: 5, valid: 2, invalid: 3 });
    const rows = (await importJobView(ctx.space.id, jobId))!.rows;
    expect(rows[2]!.errors[0]).toMatch(/serialized item. Import its assets instead/);
    expect(rows[3]!.errors[0]).toMatch(/Location NOWHERE wasn't found/);
    expect(rows[4]!.errors[0]).toMatch(/Quantity must be a whole number/);

    expect(await apply(jobId)).toMatchObject({ created: 2, invalid: 3 });
    const levelA = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: resistor.id, locationId: ctx.shelfA.id } } });
    const levelB = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: resistor.id, locationId: ctx.shelfB.id } } });
    expect([levelA.onHand, levelB.onHand]).toEqual([10, 5]);
    const movements = await prisma.stockMovement.findMany({ where: { itemId: resistor.id } });
    expect(movements).toHaveLength(2);
    expect(movements.every((m) => m.type === "IMPORT" && m.refType === "Import" && m.refId === jobId)).toBe(true);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: resistor.id } })).unitCostMinor).toBe(250);
  });

  it("reads XLSX workbooks", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stock");
    sheet.addRow(["sku", "location_code", "quantity", "unit_cost"]);
    sheet.addRow(["RES", "R1-B", 3, 2.5]);
    sheet.addRow([]);
    sheet.addRow(["RES", "R1-A", { formula: "1+1", result: 2 }, null]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const { jobId, stats } = await preview("stock", bytes, "stock.xlsx");
    expect(stats).toEqual({ total: 2, valid: 2, invalid: 0 });
    await apply(jobId);
    const levelB = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: resistor.id, locationId: ctx.shelfB.id } } });
    expect(levelB.onHand).toBe(8);
  });

  it("refuses files that are not CSV or XLSX", async () => {
    await expect(preview("stock", "sku\nRES", "stock.pdf")).rejects.toThrow(/Choose a .csv or .xlsx file/);
    await expect(preview("stock", "not a zip", "stock.xlsx")).rejects.toThrow(/isn't a valid .xlsx/);
    await expect(preview("stock", "sku,location_code,quantity\n", "stock.csv")).rejects.toThrow(/header row and at least one data row/);
  });
});

describe("importing assets", () => {
  it("registers serialized units through createAssets and refuses duplicate serials", async () => {
    const csv = "sku,location_code,serial_number,purchase_cost,purchased_at\nDMM,R1-A,SN-1,1800,2025-01-15\nDMM,R1-A,SN-2,,\nDMM,R1-B,SN-1,,\nRES,R1-A,X,,\n";
    const { jobId, stats } = await preview("assets", csv);
    expect(stats).toEqual({ total: 4, valid: 2, invalid: 2 });
    expect(await apply(jobId)).toMatchObject({ created: 2 });
    const assets = await prisma.asset.findMany({ where: { itemId: meter.id }, orderBy: { serialNumber: "asc" } });
    expect(assets.map((a) => [a.serialNumber, a.status, a.locationId, a.purchaseCostMinor])).toEqual([
      ["SN-1", "AVAILABLE", ctx.shelfA.id, 180000],
      ["SN-2", "AVAILABLE", ctx.shelfA.id, 150000],
    ]);
    expect(assets[0]!.purchasedAt?.toISOString().slice(0, 10)).toBe("2025-01-15");
    const ledger = await prisma.stockMovement.findMany({ where: { itemId: meter.id } });
    expect(ledger.map((m) => [m.type, m.refType, m.refId])).toEqual([["IMPORT", "Import", jobId], ["IMPORT", "Import", jobId]]);

    const again = await preview("assets", "sku,location_code,serial_number\nDMM,R1-B,SN-2\n");
    expect((await importJobView(ctx.space.id, again.jobId))!.rows[0]!.errors[0]).toMatch(/already registered/);
  });
});

describe("CSV templates", () => {
  it("import cleanly in order: locations, categories, items, stock, assets", async () => {
    for (const kind of IMPORT_KINDS) {
      const csv = readFileSync(`public/samples/${kind}.csv`);
      const { jobId, stats } = await preview(kind, csv, `${kind}.csv`, { createMissing: true, updateExisting: false });
      expect(stats.invalid, kind).toBe(0);
      expect(stats.total, kind).toBeGreaterThanOrEqual(2);
      const applied = await apply(jobId);
      expect(applied.created, kind).toBe(stats.total);
    }
    const goggles = await prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: ctx.space.id, sku: "LASER-GOGGLES" } }, include: { assets: true } });
    expect(goggles.assets).toHaveLength(2);
    expect(goggles.depositMinor).toBe(50000);
  });
});
