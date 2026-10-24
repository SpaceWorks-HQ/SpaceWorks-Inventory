import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAssets } from "@/lib/catalogue/assets";
import { createItem } from "@/lib/catalogue/items";
import { newQrCode } from "@/lib/catalogue/qr";
import { receiveStock } from "@/lib/inventory/availability";
import { localStock, otherSpaces, sharedStock } from "@/lib/desk/transferOptions";
import { listTransfers, transferDetail } from "@/lib/desk/transfers";
import { approveStep, cancelStep, dispatchStep, missingStep, receiveReturnStep, receiveStep, requestTransferStep, sendBackStep } from "@/lib/desk/transferSteps";
import { cleanup, createSpace, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: { id: string; slug: string; timezone: string };
let c: { id: string; slug: string; timezone: string };
let bShelf: { id: string };
const actor = { userId: null };
const storageRoot = path.resolve(process.cwd(), ".data/storage");
const stored = (spaceId: string) => prisma.evidencePhoto.findMany({ where: { evidence: { spaceId } }, select: { storageKey: true } });
const ctx = (space: { id: string; timezone: string }, userId: string) => ({ space: { id: space.id, timezone: space.timezone }, userId });

async function photoFile(name = "evidence.png") {
  const body = await sharp({ create: { width: 16, height: 12, channels: 3, background: { r: 40, g: 110, b: 99 } } }).png().toBuffer();
  return new File([new Uint8Array(body)], name, { type: "image/png" });
}

async function stocked(name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name, ...extra }, actor));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: a.space.id, itemId: item.id, locationId: a.shelfA.id, quantity, unitCostMinor: 500 }, actor));
  return item;
}

beforeAll(async () => {
  a = await seedSpace(suffix);
  b = await createSpace(`space-b-${suffix}`, a.owner.id);
  c = await createSpace(`space-c-${suffix}`, a.owner.id);
  await prisma.space.update({ where: { id: c.id }, data: { shareStockWithSpaces: false, acceptsTransfers: false } });
  bShelf = await prisma.location.create({ data: { spaceId: b.id, name: "Intake", code: "IN", kind: "SHELF", qrCode: newQrCode("location") } });
});
afterAll(async () => {
  for (const space of [a?.space.id, b?.id, c?.id]) if (space) rmSync(path.join(storageRoot, "spaces", space), { recursive: true, force: true });
  await cleanup([a.space.slug, b.slug, c.slug], a.domain);
});

describe("transfer desk options", () => {
  it("lists free local stock, push targets, pull sources and another space's shared list", async () => {
    const solder = await stocked("Solder wire", 9, { sku: "SOL-1" });
    const local = await localStock(a.space.id);
    expect(local.items.find((item) => item.id === solder.id)?.available).toEqual({ [a.shelfA.id]: 9 });
    const others = await otherSpaces(a.space.id);
    expect(others.pushTargets.map((s) => s.slug)).toContain(b.slug);
    expect(others.pushTargets.map((s) => s.slug)).not.toContain(c.slug);
    expect(others.pullSources.map((s) => s.slug)).not.toContain(c.slug);
    const shared = await sharedStock(a.space.slug, b.id);
    expect(shared?.items.find((item) => item.id === solder.id)).toEqual({ id: solder.id, name: "Solder wire", sku: "SOL-1", available: 9 });
    expect(await sharedStock(c.slug, a.space.id)).toBeNull();
    expect(await sharedStock(a.space.slug, a.space.id)).toBeNull();
  });
});

describe("transfer desk handovers", () => {
  it("runs a pull request from another space end to end, from each side's page", async () => {
    const wire = await stocked("Hook-up wire", 12, { sku: "HW-1" });
    const transfer = await requestTransferStep(ctx(b, a.owner.id), { mode: "pull", sourceSpaceSlug: a.space.slug, destLocationId: null, lines: [{ itemId: wire.id, quantity: 5 }], reason: "Class kit", neededBy: "2026-12-01" });
    expect(transfer).toMatchObject({ sourceSpaceId: a.space.id, destSpaceId: b.id, sourceLocationId: a.shelfA.id, initiatedBySpaceId: b.id });
    // The receiving side can't approve, and an unrelated space can't even see it.
    await expect(approveStep(ctx(b, a.owner.id), { transferId: transfer.id, quantities: {} })).rejects.toThrow(/sending space/);
    await expect(approveStep(ctx(c, a.owner.id), { transferId: transfer.id, quantities: {} })).rejects.toThrow(/wasn't found/);
    expect(await transferDetail(c.slug, c.id, transfer.id)).toBeNull();
    const line = await prisma.transferLine.findFirstOrThrow({ where: { transferId: transfer.id } });
    await approveStep(ctx(a.space, a.staff.id), { transferId: transfer.id, quantities: { [line.id]: 4 } });

    // A refused dispatch (label not scanned) leaves no stored photo behind.
    await expect(dispatchStep(ctx(a.space, a.staff.id), { transferId: transfer.id, quantities: {}, scannedCodes: [], carrier: null, trackingRef: null, expectedAt: "", remarks: "" }, [await photoFile()])).rejects.toThrow(/Scan the label/);
    expect((await stored(a.space.id)).length).toBe(0);
    await dispatchStep(ctx(a.space, a.staff.id), { transferId: transfer.id, quantities: { [line.id]: 4 }, scannedCodes: [wire.qrCode], carrier: "Van", trackingRef: null, expectedAt: "2026-11-02", remarks: "Boxed" }, [await photoFile()]);
    const keys = await stored(a.space.id);
    expect(keys).toHaveLength(1);
    expect(existsSync(path.join(storageRoot, keys[0]!.storageKey))).toBe(true);

    // Each side sees its own view; the receiver doesn't learn the sender's shelf.
    const fromB = (await transferDetail(b.slug, b.id, transfer.id))!;
    expect(fromB).toMatchObject({ side: "destination", status: "DISPATCHED", sourceLocation: null, sourceLocationId: null });
    expect(fromB.lines[0]).toMatchObject({ approved: 4, dispatched: 4, inTransit: 4 });
    expect(fromB.evidence[0]?.photos[0]?.url).toBe(`/api/s/${b.slug}/evidence/${fromB.evidence[0]!.photos[0]!.id}`);
    expect((await transferDetail(a.space.slug, a.space.id, transfer.id))!.sourceLocation).toBe("Shelf A (R1-A)");

    await receiveStep(ctx(b, a.owner.id), { transferId: transfer.id, destLocationId: bShelf.id, lines: [{ lineId: line.id, received: 3, damaged: 0 }], damagedAssetIds: [], scannedCodes: [wire.qrCode], remarks: "" }, [await photoFile()]);
    await sendBackStep(ctx(b, a.owner.id), { transferId: transfer.id, lines: [{ lineId: line.id, quantity: 1 }], assetIds: [], reason: "Wrong gauge" });
    await expect(receiveReturnStep(ctx(b, a.owner.id), { transferId: transfer.id, locationId: null, lines: [{ lineId: line.id, quantity: 1 }], scannedCodes: [wire.qrCode], remarks: "" }, [await photoFile()])).rejects.toThrow(/sending space/);
    expect((await stored(b.id)).length).toBe(1);
    await receiveReturnStep(ctx(a.space, a.staff.id), { transferId: transfer.id, locationId: null, lines: [{ lineId: line.id, quantity: 1 }], scannedCodes: [wire.qrCode], remarks: "" }, [await photoFile()]);
    const done = (await transferDetail(a.space.slug, a.space.id, transfer.id))!;
    expect(done.status).toBe("RECEIVED");
    expect(done.events.map((event) => event.title)).toEqual(expect.arrayContaining(["Requested", "Approved (4 units)", "Dispatched (4 units)", "Received 3", "Sent back to the sender (1 unit)"]));
  });

  it("moves serialized tools between shelves and declares a missing one", async () => {
    const drill = await stocked("Cordless drill", 0, { tracking: "SERIALIZED", sku: "DR-9" });
    const [d1, d2] = await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: drill.id, locationId: a.shelfA.id, count: 2 }, actor));
    const transfer = await requestTransferStep(ctx(a.space, a.staff.id), { mode: "internal", sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, lines: [{ itemId: drill.id, quantity: 2 }], reason: null, neededBy: "" });
    await approveStep(ctx(a.space, a.owner.id), { transferId: transfer.id, quantities: Object.fromEntries((await prisma.transferLine.findMany({ where: { transferId: transfer.id } })).map((l) => [l.id, 2])) });
    await dispatchStep(ctx(a.space, a.staff.id), { transferId: transfer.id, quantities: {}, scannedCodes: [d1!.qrCode, d2!.qrCode], carrier: null, trackingRef: null, expectedAt: "", remarks: "" }, [await photoFile()]);
    await receiveStep(ctx(a.space, a.staff.id), { transferId: transfer.id, destLocationId: null, lines: [], damagedAssetIds: [], scannedCodes: [d1!.qrCode], remarks: "" }, [await photoFile()]);
    await missingStep(ctx(a.space, a.staff.id), { transferId: transfer.id, lines: [], missingAssetIds: [d2!.id], note: "Fell off the trolley" });
    const detail = (await transferDetail(a.space.slug, a.space.id, transfer.id))!;
    expect(detail).toMatchObject({ side: "both", status: "RECEIVED" });
    expect(detail.lines[0]!.assets.map((asset) => asset.state).sort()).toEqual(["MISSING", "RECEIVED"]);
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: d1!.id } })).locationId).toBe(a.shelfB.id);
  });

  it("lists by direction and status, and refuses pushes the receiver doesn't accept", async () => {
    const tape = await stocked("Kapton tape", 6, { sku: "KT-1" });
    const push = await requestTransferStep(ctx(a.space, a.staff.id), { mode: "push", destSpaceSlug: b.slug, sourceLocationId: a.shelfA.id, lines: [{ itemId: tape.id, quantity: 2 }], reason: null, neededBy: "" });
    await expect(requestTransferStep(ctx(a.space, a.staff.id), { mode: "push", destSpaceSlug: c.slug, sourceLocationId: a.shelfA.id, lines: [{ itemId: tape.id, quantity: 1 }], reason: null, neededBy: "" })).rejects.toThrow(/doesn't accept/);
    await expect(requestTransferStep(ctx(a.space, a.staff.id), { mode: "pull", sourceSpaceSlug: c.slug, destLocationId: null, lines: [{ itemId: tape.id, quantity: 1 }], reason: null, neededBy: "" })).rejects.toThrow(/doesn't share/);
    await expect(requestTransferStep(ctx(a.space, a.staff.id), { mode: "internal", sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, lines: [{ itemId: tape.id, quantity: 1 }], reason: null, neededBy: "31/12" })).rejects.toThrow(/valid needed-by/);
    const incomingB = await listTransfers(b.id, { direction: "in", filter: "approval" });
    expect(incomingB.map((row) => row.id)).toContain(push.id);
    expect(incomingB.find((row) => row.id === push.id)?.counterpart).toBe(`From Space ${a.space.slug}`);
    expect((await listTransfers(b.id, { direction: "out", filter: "all" })).map((row) => row.id)).not.toContain(push.id);
    expect((await listTransfers(c.id, { direction: "all", filter: "all" })).length).toBe(0);
    await cancelStep(ctx(b, a.owner.id), { transferId: push.id, reason: "Not needed" });
    expect((await listTransfers(a.space.id, { direction: "out", filter: "done" })).find((row) => row.id === push.id)?.status).toBe("CANCELLED");
  });
});
