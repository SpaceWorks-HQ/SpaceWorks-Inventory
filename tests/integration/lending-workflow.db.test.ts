import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { createContainers } from "@/lib/catalogue/kits";
import { availabilityFor, availabilityOf, receiveStock } from "@/lib/inventory/availability";
import { approveLoan, cancelLoan, issueLoan, rejectLoan, renewLoan, requestLoan, resolveIncident, returnLoan } from "@/lib/lending/workflow";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import { evidence } from "../helpers/evidence";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const staff = () => ({ userId: ctx.staff.id });

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

async function lendable(name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, lendable: true, ...extra }, { userId: null }));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: item.id, locationId: ctx.shelfA.id, quantity }, { userId: null }));
  return item;
}
const request = (lines: { itemId: string; quantity: number }[], borrowerId = ctx.member.id) =>
  prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId, lines, purpose: "Build night", neededFrom: null }, { userId: borrowerId }));
const approve = (loanId: string) => prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.space.id, loanId, quantities: null }, staff()));
const issue = (loanId: string, codes: string[], remarks = "") => prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.space.id, loanId, scannedCodes: codes, evidence: { ...evidence(ctx.space.id, remarks), scannedCodes: codes } }, staff()));
const loanStatus = async (id: string) => (await prisma.loan.findUniqueOrThrow({ where: { id } })).status;
const standing = async () => (await prisma.membership.findUniqueOrThrow({ where: { id: ctx.membership.id } })).borrowingStatus;

describe("loan workflow", () => {
  it("requests, approves (holding stock), issues with scans and photos, and returns", async () => {
    const iron = await lendable("Soldering iron", 3);
    const loan = await request([{ itemId: iron.id, quantity: 2 }]);
    expect(loan.status).toBe("REQUESTED");
    await approve(loan.id);
    expect(availabilityOf(await availabilityFor(ctx.space.id, [iron.id]), iron.id)).toMatchObject({ reserved: 2, available: 1 });
    await expect(issue(loan.id, [])).rejects.toThrow(/Scan the label/);
    await expect(prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [iron.qrCode], evidence: { photos: [], remarks: "", scannedCodes: [] } }, staff()))).rejects.toThrow(/photo/);
    await issue(loan.id, [iron.qrCode]);
    expect(await loanStatus(loan.id)).toBe("ISSUED");
    expect(availabilityOf(await availabilityFor(ctx.space.id, [iron.id]), iron.id)).toMatchObject({ onHand: 1, reserved: 0, onLoan: 2 });
    const line = await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } });
    await expect(prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [iron.qrCode], lines: [{ lineId: line.id, returned: 2, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "") }, staff()))).rejects.toThrow(/remark/);
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [iron.qrCode], lines: [{ lineId: line.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "One back") }, staff()));
    expect(await loanStatus(loan.id)).toBe("PARTIALLY_RETURNED");
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [iron.qrCode], lines: [{ lineId: line.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "All back") }, staff()));
    expect(await loanStatus(loan.id)).toBe("RETURNED");
    expect(availabilityOf(await availabilityFor(ctx.space.id, [iron.id]), iron.id)).toMatchObject({ onHand: 3, onLoan: 0 });
    expect(await prisma.evidence.count({ where: { loanId: loan.id } })).toBe(3);
  });

  it("issues serialized units one asset per unit and needs the container when required", async () => {
    await prisma.space.update({ where: { id: ctx.space.id }, data: { requireContainer: true } });
    const scope = await lendable("Scope", 0, { tracking: "SERIALIZED" });
    const [a1, a2] = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: scope.id, locationId: ctx.shelfA.id, count: 2 }, { userId: null }));
    const [box] = await prisma.$transaction((tx) => createContainers(tx, ctx.space.id, { count: 1, name: null }, { userId: null }));
    const loan = await request([{ itemId: scope.id, quantity: 2 }]);
    await approve(loan.id);
    await expect(issue(loan.id, [a1!.qrCode, a2!.qrCode])).rejects.toThrow(/container/);
    await expect(issue(loan.id, [a1!.qrCode, box!.qrCode])).rejects.toThrow(/Scan 2/);
    await issue(loan.id, [a1!.qrCode, a2!.qrCode, box!.qrCode]);
    const lines = await prisma.loanLine.findMany({ where: { loanId: loan.id } });
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.assetId && l.quantityIssued === 1)).toBe(true);
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: a1!.id } })).toMatchObject({ status: "ON_LOAN" });
    // Returning without the container scan is refused; the second unit comes back damaged.
    const [l1, l2] = lines;
    await expect(prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [a1!.qrCode], lines: [{ lineId: l1!.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id, "ok") }, staff()))).rejects.toThrow(/container/);
    await prisma.$transaction((tx) => returnLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [a1!.qrCode, a2!.qrCode, box!.qrCode], lines: [{ lineId: l1!.id, returned: 1, damaged: 0, lost: 0 }, { lineId: l2!.id, returned: 0, damaged: 1, lost: 0 }], evidence: evidence(ctx.space.id, "Probe tip bent") }, staff()));
    expect(await loanStatus(loan.id)).toBe("CLOSED_WITH_ISSUE");
    expect(await standing()).toBe("RESTRICTED");
    const incident = await prisma.loanIncident.findFirstOrThrow({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => resolveIncident(tx, { spaceId: ctx.space.id, incidentId: incident.id, resolution: "REPAIRED", note: "New probe tip" }, { userId: ctx.owner.id }));
    expect(await standing()).toBe("GOOD");
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: lines.find((l) => l.id === l2!.id)!.assetId! } })).toMatchObject({ status: "AVAILABLE" });
    await prisma.space.update({ where: { id: ctx.space.id }, data: { requireContainer: false } });
  });

  it("consumes consumables at issue and closes a consumable-only loan straight away", async () => {
    const resistors = await lendable("Resistors", 100, { consumable: true });
    const loan = await request([{ itemId: resistors.id, quantity: 10 }]);
    await approve(loan.id);
    await issue(loan.id, [resistors.qrCode]);
    expect(await loanStatus(loan.id)).toBe("RETURNED");
    expect((await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } })).quantityConsumed).toBe(10);
    expect(availabilityOf(await availabilityFor(ctx.space.id, [resistors.id]), resistors.id)).toMatchObject({ onHand: 90, onLoan: 0 });
  });

  it("rejects with a reason, cancels with holds released, and enforces loan limits", async () => {
    const saw = await lendable("Jigsaw", 2);
    const a = await request([{ itemId: saw.id, quantity: 1 }]);
    await expect(prisma.$transaction((tx) => rejectLoan(tx, { spaceId: ctx.space.id, loanId: a.id, reason: " " }, staff()))).rejects.toThrow(/reason/);
    await prisma.$transaction((tx) => rejectLoan(tx, { spaceId: ctx.space.id, loanId: a.id, reason: "Out for service" }, staff()));
    const b = await request([{ itemId: saw.id, quantity: 2 }]);
    await approve(b.id);
    await prisma.$transaction((tx) => cancelLoan(tx, { spaceId: ctx.space.id, loanId: b.id, reason: null, byBorrowerId: ctx.member.id }, { userId: ctx.member.id }));
    expect(availabilityOf(await availabilityFor(ctx.space.id, [saw.id]), saw.id).reserved).toBe(0);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { maxItemsOnLoan: 1 } });
    await expect(request([{ itemId: saw.id, quantity: 2 }])).rejects.toThrow(/hold 1 items/);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { maxItemsOnLoan: 0 } });
  });

  it("renews within the limit unless someone else is waiting", async () => {
    const cutter = await lendable("Wire cutter", 2);
    const loan = await request([{ itemId: cutter.id, quantity: 1 }]);
    await approve(loan.id);
    await issue(loan.id, [cutter.qrCode]);
    const before = (await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).dueAt;
    await prisma.$transaction((tx) => renewLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, byBorrowerId: ctx.member.id }, { userId: ctx.member.id }));
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).dueAt.getTime()).toBeGreaterThan(before.getTime());
    await expect(prisma.$transaction((tx) => renewLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, byBorrowerId: ctx.member.id }, { userId: ctx.member.id }))).rejects.toThrow(/used its 1 renewal/);
  });

  it("blocks issue until the deposit is paid or marked pay later", async () => {
    await prisma.space.update({ where: { id: ctx.space.id }, data: { depositMode: "FIXED", depositMinor: 50_000, paymentBeforeIssue: true } });
    const printer = await lendable("Label printer", 1);
    const loan = await request([{ itemId: printer.id, quantity: 1 }]);
    await approve(loan.id);
    expect(await prisma.loanCharge.count({ where: { loanId: loan.id, kind: "DEPOSIT", status: "DUE" } })).toBe(1);
    await expect(issue(loan.id, [printer.qrCode])).rejects.toThrow(/deposit/);
    const { payLaterForLoan } = await import("@/lib/payments/charges");
    await prisma.$transaction((tx) => payLaterForLoan(tx, { loanId: loan.id, payerId: ctx.member.id }));
    await issue(loan.id, [printer.qrCode]);
    expect(await loanStatus(loan.id)).toBe("ISSUED");
    await prisma.space.update({ where: { id: ctx.space.id }, data: { depositMode: "NONE", depositMinor: 0 } });
  });
});
