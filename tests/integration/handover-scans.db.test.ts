import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { newQrCode } from "@/lib/catalogue/qr";
import { receiveStock } from "@/lib/inventory/availability";
import { approveLoan, issueLoan, requestLoan } from "@/lib/lending/workflow";
import { approveTransfer, requestTransfer } from "@/lib/transfers/workflow";
import { resolveDispatchScan, resolveIssueScan } from "@/lib/desk/handoverScans";
import { issueScanCatalog } from "@/lib/desk/loansDetail";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import { evidence } from "../helpers/evidence";

let a: Awaited<ReturnType<typeof seedSpace>>;
let b: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };
const LONG = { timeout: 120_000, maxWait: 20_000 };

beforeAll(async () => {
  a = await seedSpace(uniqueSuffix());
  b = await seedSpace(uniqueSuffix());
  for (const ctx of [a, b]) await prisma.space.update({ where: { id: ctx.space.id }, data: { notifyStaffOnRequest: false } });
}, 120_000);
afterAll(async () => { await cleanup([a.space.slug, b.space.slug], a.domain); await cleanup([], b.domain); });

async function tools(ctx: typeof a, name: string, batches: number) {
  const item = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, tracking: "SERIALIZED", lendable: true }, system));
  for (let i = 0; i < batches; i++) await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: item.id, locationId: ctx.shelfA.id, count: 200 }, system), LONG);
  const assets = await prisma.asset.findMany({ where: { itemId: item.id }, orderBy: { assetTag: "asc" }, select: { id: true, qrCode: true } });
  return { item, assets };
}
const approvedLoan = async (ctx: typeof a, itemId: string) => {
  const loan = await prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, lines: [{ itemId, quantity: 1 }], purpose: null, neededFrom: null }, { userId: ctx.member.id }));
  await prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, quantities: null }, { userId: ctx.staff.id }));
  return loan;
};

describe("issue scans resolved on demand", () => {
  it("resolves tags beyond the preloaded catalogue and refuses unusable or foreign codes", async () => {
    const drills = await tools(a, "Many drills", 3);
    const busy = await approvedLoan(a, drills.item.id);
    const taken = drills.assets[0]!.qrCode;
    await prisma.$transaction((tx) => issueLoan(tx, { spaceId: a.space.id, loanId: busy.id, scannedCodes: [taken], evidence: { ...evidence(a.space.id), scannedCodes: [taken] } }, { userId: a.staff.id }), LONG);
    const loan = await approvedLoan(a, drills.item.id);
    const last = drills.assets.at(-1)!;

    const catalog = await issueScanCatalog(a.space.id, [drills.item.id]);
    expect(Object.keys(catalog.assets)).toHaveLength(500);
    expect(catalog.assets[last.qrCode]).toBeUndefined();
    expect(await resolveIssueScan(a.space.id, loan.id, last.qrCode)).toMatchObject({ kind: "asset", itemId: drills.item.id, unavailable: false });
    expect(await resolveIssueScan(a.space.id, loan.id, `https://inventory.example/q/${last.qrCode.toLowerCase()}`)).toMatchObject({ code: last.qrCode });
    expect(await resolveIssueScan(a.space.id, loan.id, taken)).toMatchObject({ unavailable: true });

    const saws = await tools(a, "Unrelated saws", 1);
    expect(await resolveIssueScan(a.space.id, loan.id, saws.assets[0]!.qrCode)).toBeNull();
    const foreign = await tools(b, "Other space drills", 1);
    expect(await resolveIssueScan(a.space.id, loan.id, foreign.assets[0]!.qrCode)).toBeNull();
    expect(await resolveIssueScan(b.space.id, loan.id, last.qrCode)).toBeNull();
    expect(await resolveIssueScan(a.space.id, busy.id, last.qrCode)).toBeNull();
    expect(await resolveIssueScan(a.space.id, loan.id, "not a code")).toBeNull();
  }, 180_000);

  it("resolves containers of this space and marks one out on a loan as unavailable", async () => {
    const tape = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Container tape", lendable: true }, system));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: a.space.id, itemId: tape.id, locationId: a.shelfA.id, quantity: 4 }, system));
    const free = await prisma.container.create({ data: { spaceId: a.space.id, code: "BOX-FREE", name: "Blue box", qrCode: newQrCode("container") } });
    const busy = await prisma.container.create({ data: { spaceId: a.space.id, code: "BOX-BUSY", qrCode: newQrCode("container") } });
    const elsewhere = await prisma.container.create({ data: { spaceId: b.space.id, code: "BOX-B", qrCode: newQrCode("container") } });
    const out = await approvedLoan(a, tape.id);
    await prisma.$transaction((tx) => issueLoan(tx, { spaceId: a.space.id, loanId: out.id, scannedCodes: [busy.qrCode, tape.qrCode], evidence: { ...evidence(a.space.id), scannedCodes: [busy.qrCode, tape.qrCode] } }, { userId: a.staff.id }), LONG);
    const loan = await approvedLoan(a, tape.id);
    expect(await resolveIssueScan(a.space.id, loan.id, free.qrCode)).toEqual({ code: free.qrCode, kind: "container", itemId: null, label: "Container BOX-FREE · Blue box", unavailable: false });
    expect(await resolveIssueScan(a.space.id, loan.id, busy.qrCode)).toMatchObject({ unavailable: true });
    expect(await resolveIssueScan(a.space.id, loan.id, elsewhere.qrCode)).toBeNull();
  }, 120_000);
});

describe("dispatch scans resolved on demand", () => {
  it("resolves tags of items on an approved transfer at its source only", async () => {
    const meters = await tools(a, "Dispatch meters", 1);
    const transfer = await prisma.$transaction((tx) => requestTransfer(tx, { sourceSpaceId: a.space.id, destSpaceId: a.space.id, sourceLocationId: a.shelfA.id, destLocationId: a.shelfB.id, initiatedBySpaceId: a.space.id, lines: [{ itemId: meters.item.id, quantity: 2 }], reason: "Move", neededBy: null }, { userId: a.owner.id }));
    const code = meters.assets[5]!.qrCode;
    expect(await resolveDispatchScan(a.space.id, transfer.id, code)).toBeNull();
    await prisma.$transaction((tx) => approveTransfer(tx, { transferId: transfer.id, actingSpaceId: a.space.id, quantities: null }, { userId: a.owner.id }), LONG);
    expect(await resolveDispatchScan(a.space.id, transfer.id, code)).toMatchObject({ kind: "asset", itemId: meters.item.id, unavailable: false });
    expect(await resolveDispatchScan(b.space.id, transfer.id, code)).toBeNull();
    expect(await resolveDispatchScan(a.space.id, transfer.id, meters.item.qrCode)).toBeNull();
    const other = await tools(a, "Not on the transfer", 1);
    expect(await resolveDispatchScan(a.space.id, transfer.id, other.assets[0]!.qrCode)).toBeNull();
  }, 120_000);
});

describe("self-checkout scans resolved on demand", () => {
  it("resolves self-checkout items and tags of this space, and nothing when self-checkout is off", async () => {
    await prisma.space.update({ where: { id: a.space.id }, data: { lendingEnabled: true, selfCheckoutEnabled: true } });
    const gloves = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Self gloves", lendable: true, selfCheckout: true }, system));
    const deskOnly = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Desk gloves", lendable: true }, system));
    const torches = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Self torches", tracking: "SERIALIZED", lendable: true, selfCheckout: true }, system));
    await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: torches.id, locationId: a.shelfA.id, count: 2 }, system), LONG);
    const [free, lent] = await prisma.asset.findMany({ where: { itemId: torches.id }, orderBy: { assetTag: "asc" } });
    const loan = await approvedLoan(a, torches.id);
    await prisma.$transaction((tx) => issueLoan(tx, { spaceId: a.space.id, loanId: loan.id, scannedCodes: [lent!.qrCode], evidence: { ...evidence(a.space.id), scannedCodes: [lent!.qrCode] } }, { userId: a.staff.id }), LONG);
    const foreign = await prisma.$transaction((tx) => createItem(tx, b.space.id, { name: "Other gloves", lendable: true, selfCheckout: true }, system));

    const { resolveSelfCheckoutScan } = await import("@/lib/desk/handoverScans");
    expect(await resolveSelfCheckoutScan(a.space.id, gloves.qrCode)).toMatchObject({ kind: "item", itemId: gloves.id, tracking: "QUANTITY", unavailable: false });
    expect(await resolveSelfCheckoutScan(a.space.id, free!.qrCode)).toMatchObject({ kind: "asset", itemId: torches.id, unavailable: false });
    expect(await resolveSelfCheckoutScan(a.space.id, lent!.qrCode)).toMatchObject({ unavailable: true });
    expect(await resolveSelfCheckoutScan(a.space.id, torches.qrCode)).toBeNull();
    expect(await resolveSelfCheckoutScan(a.space.id, deskOnly.qrCode)).toBeNull();
    expect(await resolveSelfCheckoutScan(a.space.id, foreign.qrCode)).toBeNull();
    await prisma.space.update({ where: { id: a.space.id }, data: { selfCheckoutEnabled: false } });
    expect(await resolveSelfCheckoutScan(a.space.id, gloves.qrCode)).toBeNull();
  }, 120_000);
});
