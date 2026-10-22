import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { PDFDocument } from "pdf-lib";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { canLoadSampleData, loadSampleData } from "@/lib/sampleData";
import { SAMPLE_ITEMS } from "@/lib/sampleData/data";
import { GET } from "@/app/s/[spaceSlug]/labels/print/route";
import { cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let outsiderId: string;

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  ctx.space = await prisma.space.update({ where: { id: ctx.space.id }, data: { tagPrefix: `D${suffix.slice(0, 4).toUpperCase()}`, labelSize: "SMALL", labelShowLocation: true } });
  outsiderId = (await createUser(`outsider${ctx.domain}`, "Outsider")).id;
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

const load = () => prisma.$transaction((tx) => loadSampleData(tx, ctx.space.id, ctx.owner.id), { timeout: 120_000 });

describe("sample data", () => {
  it("fills an empty space through the catalogue services and the availability module", async () => {
    expect(await canLoadSampleData(ctx.space.id)).toBe(true);
    const summary = await load();
    const serialized = SAMPLE_ITEMS.filter((item) => item.assets);
    expect(summary).toMatchObject({ items: SAMPLE_ITEMS.length, kits: 2, containers: 4 });
    expect(summary.assets).toBe(serialized.reduce((sum, item) => sum + item.assets!.serials.length, 0));
    expect(await prisma.item.count({ where: { spaceId: ctx.space.id } })).toBeGreaterThanOrEqual(25);
    expect(await prisma.location.count({ where: { spaceId: ctx.space.id, code: { in: ["MAIN", "ELAB", "ELAB-B4", "WS-TW", "WS-CAB"] } } })).toBe(5);
    expect(await prisma.category.count({ where: { spaceId: ctx.space.id } })).toBe(8);
    expect(await prisma.kit.count({ where: { spaceId: ctx.space.id } })).toBe(2);
    expect(await prisma.container.count({ where: { spaceId: ctx.space.id } })).toBe(4);

    // Every unit arrived through the ledger.
    const received = await prisma.stockMovement.aggregate({ where: { spaceId: ctx.space.id, refType: "SampleData" }, _sum: { quantity: true } });
    const expected = SAMPLE_ITEMS.reduce((sum, item) => sum + (item.stock?.quantity ?? 0) + (item.assets?.serials.length ?? 0), 0);
    expect(received._sum.quantity).toBe(expected);
    const bin = await prisma.location.findUniqueOrThrow({ where: { spaceId_code: { spaceId: ctx.space.id, code: "ELAB-B1" } }, include: { parent: { include: { parent: true } } } });
    expect(bin.parent?.name).toBe("Shelf A");
    expect(bin.parent?.parent?.name).toBe("Electronics lab");

    const low = await prisma.item.findMany({ where: { spaceId: ctx.space.id, lowStockAlertAt: { not: null } }, select: { sku: true } });
    expect(low.map((item) => item.sku).sort()).toEqual(["JUMPER-MM", "SOLDER-WIRE"]);
    expect(await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "space.sample_data_loaded" } })).toBe(1);
  });

  it("refuses to load twice", async () => {
    expect(await canLoadSampleData(ctx.space.id)).toBe(false);
    await expect(load()).rejects.toBeInstanceOf(DomainError);
    await expect(load()).rejects.toThrow(/no items yet/);
  });
});

describe("label PDF route", () => {
  const signIn = (userId: string | null) => vi.mocked(auth).mockResolvedValue((userId ? { user: { id: userId } } : null) as never);
  const get = (query: string, slug = ctx.space.slug) =>
    GET(new Request(`http://localhost:3100/s/${slug}/labels/print?${query}`), { params: Promise.resolve({ spaceSlug: slug }) });

  it("returns a private PDF for staff", async () => {
    signIn(ctx.staff.id);
    const response = await get("kind=locations&all=1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const count = await prisma.location.count({ where: { spaceId: ctx.space.id, archivedAt: null } });
    expect(Number(response.headers.get("x-label-count"))).toBe(count);
    const doc = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(doc.getPageCount()).toBe(Math.ceil(count / 65));
  });

  it("prints chosen assets and items, filtered by location", async () => {
    signIn(ctx.staff.id);
    const assets = await prisma.asset.findMany({ where: { spaceId: ctx.space.id }, take: 3, select: { id: true } });
    const response = await get(`kind=assets&ids=${assets.map((a) => a.id).join(",")}&size=LARGE`);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-label-count")).toBe("3");
    const lab = await prisma.location.findUniqueOrThrow({ where: { spaceId_code: { spaceId: ctx.space.id, code: "ELAB" } } });
    const items = await get(`kind=items&all=1&location=${lab.id}`);
    expect(items.status).toBe(200);
    // Only items stocked somewhere inside the electronics lab.
    expect(Number(items.headers.get("x-label-count"))).toBe(SAMPLE_ITEMS.filter((item) => (item.stock?.location ?? item.assets?.location ?? "").startsWith("ELAB")).length);
  });

  it("answers 404 for non-members, members, signed-out users and foreign ids", async () => {
    signIn(outsiderId);
    expect((await get("kind=items&all=1")).status).toBe(404);
    signIn(ctx.member.id);
    expect((await get("kind=items&all=1")).status).toBe(404);
    signIn(null);
    expect((await get("kind=items&all=1")).status).toBe(404);
    signIn(ctx.staff.id);
    expect((await get("kind=items&all=1", "no-such-space")).status).toBe(404);
    expect((await get("kind=items&ids=not-a-real-id")).status).toBe(404);
    expect((await get("kind=items")).status).toBe(400);
  });
});
