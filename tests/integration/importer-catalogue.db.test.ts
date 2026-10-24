import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { applyImportJob, importErrorReport, importJobView, previewImport, recheckImport, type ImportKind } from "@/lib/importer";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let actor: { userId: string };
const off = { createMissing: false, updateExisting: false };

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  actor = { userId: ctx.owner.id };
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

const preview = (kind: ImportKind, csv: string, options = off) =>
  previewImport(ctx.space, actor, { kind, fileName: `${kind}.csv`, bytes: Buffer.from(csv), options });
const apply = (jobId: string) => prisma.$transaction((tx) => applyImportJob(tx, ctx.space, jobId, actor), { timeout: 60_000 });
const rowsOf = async (jobId: string) => (await importJobView(ctx.space.id, jobId))!.rows;

describe("importing locations", () => {
  it("allows parents defined above in the same file or already in the space", async () => {
    const csv = [
      "Name,Code,Kind,Parent code",
      "Annex,ANX,building,",
      "Store room,ANX-S,room,ANX",
      "Bin 9,ANX-S-9,bin,anx-s",
      "Shelf C,R1-C,shelf,R1",
      "Too early,EARLY,shelf,LATER",
      "Later,LATER,room,",
      "Duplicate,ANX,room,",
      "Taken,R1-A,shelf,",
      "Orphan,ORPH,bin,NOPE",
    ].join("\n");
    const { jobId, stats } = await preview("locations", csv);
    expect(stats).toEqual({ total: 9, valid: 5, invalid: 4 });
    const errors = Object.fromEntries((await rowsOf(jobId)).map((row) => [row.line, row.errors.join(" ")]));
    expect(errors[6]).toMatch(/must be listed above this row/);
    expect(errors[8]).toMatch(/appears more than once in this file \(row 2\)/);
    expect(errors[9]).toMatch(/already used/);
    expect(errors[10]).toMatch(/NOPE wasn't found/);

    const applied = await apply(jobId);
    expect(applied).toMatchObject({ created: 5, updated: 0, invalid: 4 });
    const bin = await prisma.location.findUniqueOrThrow({ where: { spaceId_code: { spaceId: ctx.space.id, code: "ANX-S-9" } }, include: { parent: { include: { parent: true } } } });
    expect(bin.kind).toBe("BIN");
    expect(bin.parent?.code).toBe("ANX-S");
    expect(bin.parent?.parent?.code).toBe("ANX");
    expect((await prisma.location.findUniqueOrThrow({ where: { spaceId_code: { spaceId: ctx.space.id, code: "R1-C" } } })).parentId).toBe(ctx.room.id);
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(job.status).toBe("APPLIED");
    expect(await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "import.applied", targetId: jobId } })).toBe(1);
    await expect(apply(jobId)).rejects.toThrow(/already applied/);
  });

  it("refuses a file without the required columns", async () => {
    await expect(preview("locations", "Name,Parent\nShelf,R1")).rejects.toThrow(/no code column/);
  });
});

describe("importing categories", () => {
  it("links sub-categories to parents above them and flags existing names", async () => {
    await prisma.category.create({ data: { spaceId: ctx.space.id, name: "Existing" } });
    const csv = "category,parent category\nLaser,\nSheet stock,laser\nexisting,\nOffcuts,Existing\n";
    const { jobId, stats } = await preview("categories", csv);
    expect(stats).toEqual({ total: 4, valid: 3, invalid: 1 });
    expect((await rowsOf(jobId))[2]!.errors[0]).toMatch(/already exists/);
    await apply(jobId);
    const sheet = await prisma.category.findFirstOrThrow({ where: { spaceId: ctx.space.id, name: "Sheet stock" }, include: { parent: true } });
    expect(sheet.parent?.name).toBe("Laser");
    const offcuts = await prisma.category.findFirstOrThrow({ where: { spaceId: ctx.space.id, name: "Offcuts" }, include: { parent: true } });
    expect(offcuts.parent?.name).toBe("Existing");
  });
});

describe("importing items", () => {
  it("creates missing categories and units only when asked", async () => {
    const csv = "sku,name,category,unit,tracking,unit_cost,lendable,tags\nGLUE-GUN,Glue gun,Craft,Each,quantity,349.99,yes,craft;hot glue\nCAL-1,Caliper,Measuring tools,pcs,serialized,1500,yes,\n";
    const { jobId, stats } = await preview("items", csv);
    expect(stats.invalid).toBe(2);
    expect((await rowsOf(jobId))[0]!.errors.join(" ")).toMatch(/Category Craft wasn't found.*Unit Each wasn't found/);
    const rechecked = await recheckImport(ctx.space, actor, jobId, { createMissing: true, updateExisting: false });
    expect(rechecked.stats).toEqual({ total: 2, valid: 2, invalid: 0 });
    expect(await apply(jobId)).toMatchObject({ created: 2, updated: 0 });
    const glue = await prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: ctx.space.id, sku: "GLUE-GUN" } }, include: { category: true, unit: true } });
    expect(glue).toMatchObject({ unitCostMinor: 34999, lendable: true, tracking: "QUANTITY", tags: ["craft", "hot glue"] });
    expect(glue.category?.name).toBe("Craft");
    expect(glue.unit?.name).toBe("Each");
    const caliper = await prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: ctx.space.id, sku: "CAL-1" } }, include: { unit: true } });
    expect(caliper.tracking).toBe("SERIALIZED");
    expect(caliper.unit?.symbol).toBe("pcs");
  });

  it("flags duplicate SKUs in the file and against the catalogue, and updates existing items when asked", async () => {
    const existing = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { sku: "DRILL-1", name: "Old drill", lendable: true, unitCostMinor: 100, brand: "Bosch" }, actor));
    const csv = "sku,name,unit_cost,brand,lendable\nDRILL-1,Cordless drill 18 V,6500,,\nNEW-1,New thing,10,,\nNEW-1,New thing again,10,,\n";
    const first = await preview("items", csv);
    const rows = await rowsOf(first.jobId);
    expect(rows[0]!.errors[0]).toMatch(/already exists. Turn on Update existing items/);
    expect(rows[2]!.errors[0]).toMatch(/appears more than once in this file \(row 3\)/);

    const update = await preview("items", csv, { createMissing: false, updateExisting: true });
    expect(update.stats).toEqual({ total: 3, valid: 2, invalid: 1 });
    expect(await apply(update.jobId)).toMatchObject({ created: 1, updated: 1, invalid: 1 });
    const drill = await prisma.item.findUniqueOrThrow({ where: { id: existing.id } });
    expect(drill).toMatchObject({ name: "Cordless drill 18 V", unitCostMinor: 650000, brand: "Bosch", lendable: true, qrCode: existing.qrCode });
  });

  it("checks every row again at apply time", async () => {
    const { jobId, stats } = await preview("items", "sku,name\nRACE-1,Raced item\nRACE-2,Other item\n");
    expect(stats.valid).toBe(2);
    // Someone creates the same SKU between preview and apply.
    await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { sku: "RACE-1", name: "Created meanwhile" }, actor));
    const applied = await apply(jobId);
    expect(applied).toMatchObject({ created: 1, invalid: 1 });
    expect((await prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: ctx.space.id, sku: "RACE-1" } } })).name).toBe("Created meanwhile");
    const report = await importErrorReport(ctx.space.id, jobId);
    expect(report?.csv).toMatch(/^row,errors,sku,name/);
    expect(report?.csv).toMatch(/2,SKU RACE-1 already exists/);
  });
});
