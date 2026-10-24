import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { receiveStock } from "@/lib/inventory/availability";
import { approveLoan, cancelLoan, issueLoan, renewLoan, requestLoan, returnLoan } from "@/lib/lending/workflow";
import { memberLoans } from "@/lib/desk/loansMember";
import { scanTarget } from "@/lib/desk/scan";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import { evidence } from "../helpers/evidence";

let ctx: Awaited<ReturnType<typeof seedSpace>>;
const system = { userId: null };
const staff = () => ({ userId: ctx.staff.id });
beforeAll(async () => {
  ctx = await seedSpace(uniqueSuffix());
  await prisma.space.update({ where: { id: ctx.space.id }, data: { notifyStaffOnRequest: false } });
});
afterAll(async () => { await cleanup([ctx.space.slug], ctx.domain); });

async function item(name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const result = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, lendable: true, ...extra }, system));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: ctx.space.id, itemId: result.id, locationId: ctx.shelfA.id, quantity }, system));
  return result;
}
const request = (lines: { itemId: string; quantity: number }[]) => prisma.$transaction((tx) => requestLoan(tx, { spaceId: ctx.space.id, borrowerId: ctx.member.id, lines, purpose: null, neededFrom: null }, { userId: ctx.member.id }));
async function issue(loanId: string, scannedCodes: string[]) {
  await prisma.$transaction((tx) => approveLoan(tx, { spaceId: ctx.space.id, loanId, quantities: null }, staff()));
  await prisma.$transaction((tx) => issueLoan(tx, { spaceId: ctx.space.id, loanId, scannedCodes, evidence: { ...evidence(ctx.space.id), scannedCodes } }, staff()));
}

describe("borrower ownership", () => {
  it("gives identical not-found errors for foreign and unknown loans before any status check", async () => {
    const lamp = await item("Private loan lamp", 1);
    const loan = await request([{ itemId: lamp.id, quantity: 1 }]);
    await issue(loan.id, [lamp.qrCode]);
    const line = await prisma.loanLine.findFirstOrThrow({ where: { loanId: loan.id } });
    const attempt = (loanId: string, action: "cancel" | "renew" | "return") => prisma.$transaction<unknown>((tx) => {
      const input = { spaceId: ctx.space.id, loanId, byBorrowerId: ctx.staff.id };
      if (action === "cancel") return cancelLoan(tx, { ...input, reason: null }, staff());
      if (action === "renew") return renewLoan(tx, input, staff());
      return returnLoan(tx, { ...input, lines: [], scannedCodes: [], evidence: evidence(ctx.space.id) }, staff());
    });
    for (const status of ["ISSUED", "RETURNED"]) {
      expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe(status);
      for (const action of ["cancel", "renew", "return"] as const) {
        const foreign = await attempt(loan.id, action).catch((error: unknown) => error);
        const unknown = await attempt("unknownloan123", action).catch((error: unknown) => error);
        expect(foreign).toMatchObject({ code: "not_found", message: "That loan wasn't found." });
        expect(foreign).toEqual(unknown);
      }
      if (status === "ISSUED") await prisma.$transaction((tx) => returnLoan(tx, {
        spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [lamp.qrCode],
        lines: [{ lineId: line.id, returned: 1, damaged: 0, lost: 0 }], evidence: evidence(ctx.space.id),
      }, staff()));
    }
  });
});

describe("member loan history", () => {
  it("keeps an older active loan alongside only the latest 50 closed loans", async () => {
    const tape = await item("History tape", 1);
    const active = await request([{ itemId: tape.id, quantity: 1 }]);
    await prisma.loan.update({ where: { id: active.id }, data: { createdAt: new Date("2000-01-01") } });
    const closed: string[] = [];
    for (let n = 0; n < 105; n += 1) {
      const loan = await request([{ itemId: tape.id, quantity: 1 }]);
      await prisma.$transaction((tx) => cancelLoan(tx, { spaceId: ctx.space.id, loanId: loan.id, byBorrowerId: ctx.member.id, reason: null }, { userId: ctx.member.id }));
      await prisma.loan.update({ where: { id: loan.id }, data: { createdAt: new Date(Date.UTC(2020, 0, 1, 0, n)) } });
      closed.push(loan.id);
    }
    const loans = await memberLoans(ctx.space.id, ctx.member.id);
    expect(loans.filter((loan) => loan.open).map((loan) => loan.id)).toContain(active.id);
    const expected = await prisma.loan.findMany({ where: { spaceId: ctx.space.id, borrowerId: ctx.member.id, status: { in: ["RETURNED", "CANCELLED"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true } });
    expect(loans.filter((loan) => !loan.open).map((loan) => loan.id)).toEqual(expected.map((loan) => loan.id));
    expect(loans.map((loan) => loan.id)).not.toContain(closed[0]);
    expect(loans[0]!.open).toBe(true);
    await prisma.$transaction((tx) => cancelLoan(tx, { spaceId: ctx.space.id, loanId: active.id, byBorrowerId: ctx.member.id, reason: null }, { userId: ctx.member.id }));
  }, 120_000);
});

describe("scan holders", () => {
  it("only reports outstanding matching lines, including the exact asset on a part-returned loan", async () => {
    const drills = await item("Scan drills", 0, { tracking: "SERIALIZED" });
    const [first, second] = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, { itemId: drills.id, locationId: ctx.shelfA.id, count: 2 }, system));
    const pliers = await item("Scan pliers", 3);
    const tape = await item("Consumed tape", 1, { consumable: true });
    const loan = await request([{ itemId: drills.id, quantity: 2 }, { itemId: pliers.id, quantity: 3 }, { itemId: tape.id, quantity: 1 }]);
    await issue(loan.id, [first!.qrCode, second!.qrCode, pliers.qrCode, tape.qrCode]);
    const lines = await prisma.loanLine.findMany({ where: { loanId: loan.id } });
    await prisma.$transaction((tx) => returnLoan(tx, {
      spaceId: ctx.space.id, loanId: loan.id, scannedCodes: [first!.qrCode, pliers.qrCode],
      lines: [
        { lineId: lines.find((line) => line.assetId === first!.id)!.id, returned: 1, damaged: 0, lost: 0 },
        { lineId: lines.find((line) => line.itemId === pliers.id)!.id, returned: 1, damaged: 1, lost: 1 },
      ], evidence: evidence(ctx.space.id),
    }, staff()));
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } })).status).toBe("PARTIALLY_RETURNED");
    const holders = async (code: string) => (await scanTarget(ctx.space.slug, ctx.space.id, code))!.holders.filter((holder) => holder.kind === "loan");
    expect(await holders(first!.qrCode)).toEqual([]);
    expect(await holders(second!.qrCode)).toHaveLength(1);
    expect(await holders(drills.qrCode)).toHaveLength(1);
    expect(await holders(pliers.qrCode)).toEqual([]);
    expect(await holders(tape.qrCode)).toEqual([]);
  });
});
