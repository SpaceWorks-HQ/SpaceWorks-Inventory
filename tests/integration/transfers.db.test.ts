import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { newQrCode } from "@/lib/catalogue/qr";
import { availabilityFor, availabilityOf, receiveStock } from "@/lib/inventory/availability";
import { approveTransfer, cancelTransfer, declareMissing, dispatchTransfer, receiveReturn, receiveTransfer, rejectTransfer, requestTransfer, sendBack } from "@/lib/transfers/workflow";
import { cleanup, createSpace, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import { evidence } from "../helpers/evidence";

const suffix = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: { id: string; slug: string };
let bShelf: { id: string };
const actor = { userId: null };

beforeAll(async () => {
  a = await seedSpace(suffix);
  const other = await createSpace(`space-b-${suffix}`, a.owner.id);
  b = other;
  bShelf = await prisma.location.create({ data: { spaceId: b.id, name: "Intake", code: "IN", kind: "SHELF", qrCode: newQrCode("location") } });
});
afterAll(async () => { await cleanup([a.space.slug, b.slug], a.domain); });

async function stocked(name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name, ...extra }, actor));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: a.space.id, itemId: item.id, locationId: a.shelfA.id, quantity, unitCostMinor: 1000 }, actor));
  return item;
}
const totals = async (spaceId: string, itemId: string) => availabilityOf(await availabilityFor(spaceId, [itemId]), itemId);
const ev = (spaceId: string, codes: string[] = [], remarks = "") => ({ ...evidence(spaceId, remarks), scannedCodes: codes });

describe("transfers inside a space", () => {
  it("holds on approval, leaves on dispatch, lands on receipt", async () => {
    const servo = await stocked("Servo motor", 10);
    const t = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: a.space.id, sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: servo.id, quantity: 6 }], reason: "Workshop", neededBy: null }, actor));
    expect(t.status).toBe("REQUESTED");
    await prisma.$transaction((tx) => approveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, quantities: null }, actor));
    expect(await totals(a.space.id, servo.id)).toMatchObject({ onHand: 10, reserved: 6, available: 4 });
    await expect(prisma.$transaction((tx) => dispatchTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, scannedCodes: [], carrier: null, trackingRef: null, expectedAt: null, evidence: ev(a.space.id) }, actor))).rejects.toThrow(/Scan the label/);
    const line = await prisma.transferLine.findFirstOrThrow({ where: { transferId: t.id } });
    await prisma.$transaction((tx) => dispatchTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, quantities: { [line.id]: 5 }, scannedCodes: [servo.qrCode], carrier: "Hand carry", trackingRef: null, expectedAt: null, evidence: ev(a.space.id) }, actor));
    // 5 in transit (not available anywhere), the sixth approved unit released.
    expect(await totals(a.space.id, servo.id)).toMatchObject({ onHand: 5, reserved: 0, available: 5, inTransit: 5 });
    await prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, destLocationId: null, lines: [{ lineId: line.id, received: 3, damaged: 0 }], scannedCodes: [servo.qrCode], evidence: ev(a.space.id) }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("PARTIALLY_RECEIVED");
    await expect(prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, destLocationId: null, lines: [{ lineId: line.id, received: 1, damaged: 1 }], scannedCodes: [servo.qrCode], evidence: ev(a.space.id) }, actor))).rejects.toThrow(/remark/);
    await prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, destLocationId: null, lines: [{ lineId: line.id, received: 1, damaged: 1 }], scannedCodes: [servo.qrCode], evidence: ev(a.space.id, [], "One cracked case") }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("RECEIVED");
    expect(await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: servo.id, locationId: a.shelfB.id } } })).toMatchObject({ onHand: 5, quarantined: 1 });
    expect(await totals(a.space.id, servo.id)).toMatchObject({ onHand: 10, inTransit: 0 });
    expect(await prisma.transferEvent.count({ where: { transferId: t.id } })).toBe(5);
  });

  it("skips approval when the inventory setting allows it and releases holds on cancel", async () => {
    await prisma.space.update({ where: { id: a.space.id }, data: { internalTransferApproval: false } });
    const glue = await stocked("Glue gun", 2);
    const t = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: a.space.id, sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: glue.id, quantity: 2 }], reason: null, neededBy: null }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("APPROVED");
    await prisma.$transaction((tx) => cancelTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, reason: "Not needed" }, actor));
    expect(await totals(a.space.id, glue.id)).toMatchObject({ reserved: 0, available: 2 });
    await prisma.space.update({ where: { id: a.space.id }, data: { internalTransferApproval: true } });
  });

  it("refuses to approve more than is free and lets the source reject", async () => {
    const rare = await stocked("Rare sensor", 1);
    const t = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: a.space.id, sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: rare.id, quantity: 2 }], reason: null, neededBy: null }, actor));
    await expect(prisma.$transaction((tx) => approveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, quantities: null }, actor))).rejects.toThrow(/Only 1/);
    await prisma.$transaction((tx) => rejectTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, reason: "Only one left" }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("REJECTED");
  });
});

describe("transfers between spaces", () => {
  it("moves quantity stock and serialized assets into the other space's catalogue", async () => {
    const wire = await stocked("Jumper wires", 20, { sku: "JW-1" });
    const drill = await stocked("Drill", 0, { tracking: "SERIALIZED", sku: "DRL" });
    const [d1, d2] = await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: drill.id, locationId: a.shelfA.id, count: 2 }, actor));
    const t = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: b.id, sourceLocationId: a.shelfA.id, destLocationId: null, initiatedBySpaceId: b.id, lines: [{ itemId: wire.id, quantity: 8 }, { itemId: drill.id, quantity: 2 }], reason: "Workshop week", neededBy: null }, actor));
    await expect(prisma.$transaction((tx) => approveTransfer(tx, { transferId: t.id, actingSpaceId: b.id, quantities: null }, actor))).rejects.toThrow(/sending space/);
    await prisma.$transaction((tx) => approveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, quantities: null }, actor));
    await prisma.$transaction((tx) => dispatchTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, scannedCodes: [wire.qrCode, d1!.qrCode, d2!.qrCode], carrier: null, trackingRef: null, expectedAt: null, evidence: ev(a.space.id) }, actor));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: d1!.id } })).toMatchObject({ status: "IN_TRANSIT" });
    const lines = await prisma.transferLine.findMany({ where: { transferId: t.id } });
    const wireLine = lines.find((l) => l.itemId === wire.id)!;
    await expect(prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: b.id, destLocationId: null, lines: [], scannedCodes: [], evidence: ev(b.id) }, actor))).rejects.toThrow(/where the stock goes/);
    await prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: b.id, destLocationId: bShelf.id, lines: [{ lineId: wireLine.id, received: 6, damaged: 0 }], scannedCodes: [wire.qrCode, d1!.qrCode], evidence: ev(b.id) }, actor));
    const bWire = await prisma.item.findUniqueOrThrow({ where: { spaceId_sku: { spaceId: b.id, sku: "JW-1" } } });
    expect(await totals(b.id, bWire.id)).toMatchObject({ onHand: 6 });
    expect(bWire.avgCostMinor).toBe(1000);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: d1!.id } })).toMatchObject({ spaceId: b.id, status: "AVAILABLE", locationId: bShelf.id });
    // The remaining 2 wires are sent back; the second drill is lost on the way.
    await prisma.$transaction((tx) => sendBack(tx, { transferId: t.id, actingSpaceId: b.id, lines: [{ lineId: wireLine.id, quantity: 2 }], reason: "Not needed after all" }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("RETURNING");
    await prisma.$transaction((tx) => declareMissing(tx, { transferId: t.id, actingSpaceId: b.id, lines: [], missingAssetIds: [d2!.id], note: "Box arrived without it" }, actor));
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: d2!.id } })).toMatchObject({ status: "LOST" });
    await prisma.$transaction((tx) => receiveReturn(tx, { transferId: t.id, actingSpaceId: a.space.id, locationId: null, lines: [{ lineId: wireLine.id, quantity: 2 }], scannedCodes: [wire.qrCode], evidence: ev(a.space.id) }, actor));
    expect((await prisma.transfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("RECEIVED");
    expect(await totals(a.space.id, wire.id)).toMatchObject({ onHand: 14, inTransit: 0 });
  });

  it("refuses labels from outside the transfer and destinations that don't accept transfers", async () => {
    const tape = await stocked("Kapton tape", 5);
    const other = await stocked("Other thing", 5);
    const t = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: b.id, sourceLocationId: a.shelfA.id, destLocationId: bShelf.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: tape.id, quantity: 1 }], reason: null, neededBy: null }, actor));
    await prisma.$transaction((tx) => approveTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, quantities: null }, actor));
    await prisma.$transaction((tx) => dispatchTransfer(tx, { transferId: t.id, actingSpaceId: a.space.id, scannedCodes: [tape.qrCode], carrier: null, trackingRef: null, expectedAt: null, evidence: ev(a.space.id) }, actor));
    const line = await prisma.transferLine.findFirstOrThrow({ where: { transferId: t.id } });
    await expect(prisma.$transaction((tx) => receiveTransfer(tx, { transferId: t.id, actingSpaceId: b.id, destLocationId: null, lines: [{ lineId: line.id, received: 1, damaged: 0 }], scannedCodes: [other.qrCode], evidence: ev(b.id) }, actor))).rejects.toThrow(/isn't on this transfer/);
    await prisma.space.update({ where: { id: b.id }, data: { acceptsTransfers: false } });
    await expect(prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: b.id, sourceLocationId: a.shelfA.id, destLocationId: bShelf.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: tape.id, quantity: 1 }], reason: null, neededBy: null }, actor))).rejects.toThrow(/doesn't accept/);
  });
});
