import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { receiveStock } from "@/lib/inventory/availability";
import { evidenceFor } from "@/lib/desk/evidence";
import { loanDetail, loanTimeline } from "@/lib/desk/loansDetail";
import { memberLoans } from "@/lib/desk/loansMember";
import { loanQueue } from "@/lib/desk/loansQueue";
import { approveStep, cancelStep, issueStep, rejectStep, renewStep, requestStep, returnStep, selfCheckoutStep, selfReturnStep, type StepContext } from "@/lib/desk/loanSteps";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffixA = uniqueSuffix();
const suffixB = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: Awaited<ReturnType<typeof seedSpace>>;
let png: Buffer;

beforeAll(async () => {
  a = await seedSpace(suffixA);
  b = await seedSpace(suffixB);
  png = await sharp({ create: { width: 16, height: 16, channels: 3, background: { r: 0, g: 110, b: 99 } } }).png().toBuffer();
});
afterAll(async () => {
  for (const space of [a.space, b.space]) await rm(path.resolve(process.cwd(), ".data/storage/spaces", space.id), { recursive: true, force: true });
  await cleanup([a.space.slug], a.domain);
  await cleanup([b.space.slug], b.domain);
});

const photo = () => new File([new Uint8Array(png)], "evidence.png", { type: "image/png" });
const ctxOf = (space: { id: string; timezone: string }, userId: string): StepContext => ({ spaceId: space.id, userId, timeZone: space.timezone });
const deskA = () => ctxOf(a.space, a.staff.id);
const memberA = () => ctxOf(a.space, a.member.id);
const storedPhotos = async (spaceId: string) => {
  const dir = path.resolve(process.cwd(), ".data/storage/spaces", spaceId, "evidence");
  // Deleting a photo leaves its (empty) folder behind, so count the files themselves.
  return (await readdir(dir, { recursive: true }).catch(() => [] as string[])).filter((name) => name.endsWith(".webp")).length;
};

async function lendable(space: { id: string }, shelf: { id: string }, name: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, space.id, { name, lendable: true, ...extra }, { userId: null }));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId: space.id, itemId: item.id, locationId: shelf.id, quantity }, { userId: null }));
  return item;
}

describe("desk handovers", () => {
  it("requests, approves, issues and takes back with stored photos, and shows it in the read models", async () => {
    const iron = await lendable(a.space, a.shelfA, "Soldering iron", 3);
    const { loanId } = await requestStep(memberA(), { lines: [{ itemId: iron.id, quantity: 2 }], purpose: "Badge kit", neededFrom: "" });
    expect((await loanQueue(a.space.id, "requests", "")).rows.map((r) => r.id)).toContain(loanId);
    expect((await loanQueue(a.space.id, "requests", a.member.email)).rows.map((r) => r.id)).toContain(loanId);
    await approveStep(deskA(), { loanId, quantities: Object.fromEntries((await loanDetail(a.space.id, loanId))!.lines.map((l) => [l.id, 2])) });

    const before = await storedPhotos(a.space.id);
    await expect(issueStep(deskA(), { loanId, scannedCodes: [], remarks: "" }, [photo()])).rejects.toThrow(/Scan the label/);
    expect(await storedPhotos(a.space.id)).toBe(before);
    await issueStep(deskA(), { loanId, scannedCodes: [iron.qrCode], remarks: "Tip cleaned" }, [photo()]);
    expect(await storedPhotos(a.space.id)).toBe(before + 1);

    const detail = (await loanDetail(a.space.id, loanId))!;
    expect(detail.status).toBe("ISSUED");
    expect(detail.lines[0]).toMatchObject({ issued: 2, outstanding: 2 });
    const evidence = await evidenceFor(a.space.slug, { spaceId: a.space.id, loanId });
    expect(evidence[0]).toMatchObject({ kindLabel: "Handed over", remarks: "Tip cleaned", scannedCount: 1 });
    expect(evidence[0]!.photos[0]!.url).toMatch(new RegExp(`^/api/s/${a.space.slug}/evidence/`));

    await renewStep(memberA(), loanId, true);
    const line = detail.lines[0]!;
    await returnStep(deskA(), { loanId, scannedCodes: [iron.qrCode], remarks: "All back", lines: [{ lineId: line.id, returned: 2, damaged: 0, lost: 0, locationId: a.shelfB.id }] }, [photo()]);
    expect((await loanDetail(a.space.id, loanId))!.status).toBe("RETURNED");
    const titles = (await loanTimeline(a.space.id, loanId, [])).map((e) => e.title);
    expect(titles).toEqual(expect.arrayContaining(["Requested", "Approved", "Handed over", "Renewed", "Returned"]));
    expect((await memberLoans(a.space.id, a.member.id)).find((l) => l.id === loanId)).toMatchObject({ open: false, out: 0 });
  });

  it("checks out and self-returns serialized tools, and keeps the photos only when it succeeds", async () => {
    await prisma.space.update({ where: { id: a.space.id }, data: { selfCheckoutEnabled: true } });
    const drill = await lendable(a.space, a.shelfA, "Drill", 0, { tracking: "SERIALIZED", selfCheckout: true, requiresApproval: false });
    const [unit] = await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: drill.id, locationId: a.shelfA.id, count: 1 }, { userId: null }));
    const before = await storedPhotos(a.space.id);
    await expect(selfCheckoutStep(memberA(), { scannedCodes: [drill.qrCode], quantities: {}, remarks: "" }, [photo()])).rejects.toThrow(/asset label/);
    expect(await storedPhotos(a.space.id)).toBe(before);
    const { loanId } = await selfCheckoutStep(memberA(), { scannedCodes: [unit!.qrCode], quantities: {}, remarks: "" }, [photo()]);
    expect((await loanDetail(a.space.id, loanId))).toMatchObject({ status: "ISSUED", selfCheckout: true });
    await expect(selfReturnStep(ctxOf(a.space, a.staff.id), { loanId, scannedCodes: [unit!.qrCode], remarks: "Fine" }, [photo()])).rejects.toThrow(/wasn't found/);
    await expect(selfReturnStep(memberA(), { loanId, scannedCodes: [], remarks: "Fine" }, [photo()])).rejects.toThrow(/Scan/);
    await selfReturnStep(memberA(), { loanId, scannedCodes: [unit!.qrCode], remarks: "Fine" }, [photo()]);
    expect((await loanDetail(a.space.id, loanId))!.status).toBe("RETURNED");
    expect(await storedPhotos(a.space.id)).toBe(before + 2);
  });

  it("lets the member withdraw a request and staff reject one", async () => {
    const saw = await lendable(a.space, a.shelfA, "Jigsaw", 2);
    const first = await requestStep(memberA(), { lines: [{ itemId: saw.id, quantity: 1 }], purpose: "", neededFrom: "" });
    await expect(cancelStep(ctxOf(a.space, a.owner.id), { loanId: first.loanId, reason: "" }, true)).rejects.toThrow(/wasn't found/);
    expect(await cancelStep(memberA(), { loanId: first.loanId, reason: "Not needed" }, true)).toEqual({ refundIds: [] });
    const second = await requestStep(memberA(), { lines: [{ itemId: saw.id, quantity: 1 }], purpose: "", neededFrom: "" });
    await rejectStep(deskA(), { loanId: second.loanId, reason: "Booked for a workshop" });
    const closed = (await loanQueue(a.space.id, "closed", "")).rows.map((r) => r.id);
    expect(closed).toEqual(expect.arrayContaining([first.loanId, second.loanId]));
  });
});

describe("tenancy", () => {
  it("keeps one space's loans out of another space's desk and other members' pages", async () => {
    const lamp = await lendable(b.space, b.shelfA, "Work lamp", 2);
    const { loanId } = await requestStep(ctxOf(b.space, b.member.id), { lines: [{ itemId: lamp.id, quantity: 1 }], purpose: "", neededFrom: "" });
    expect(await loanDetail(a.space.id, loanId)).toBeNull();
    expect((await loanQueue(a.space.id, "requests", "")).rows.map((r) => r.id)).not.toContain(loanId);
    expect((await loanQueue(a.space.id, "requests", b.member.email)).rows).toHaveLength(0);
    await expect(approveStep(deskA(), { loanId, quantities: {} })).rejects.toThrow(/wasn't found/);
    await expect(cancelStep(deskA(), { loanId, reason: "" })).rejects.toThrow(/wasn't found/);
    await expect(requestStep(memberA(), { lines: [{ itemId: lamp.id, quantity: 1 }], purpose: "", neededFrom: "" })).rejects.toThrow(/can't be borrowed/);
    expect(await loanDetail(b.space.id, loanId, { borrowerId: b.staff.id })).toBeNull();
    expect(await loanDetail(b.space.id, loanId, { borrowerId: b.member.id })).not.toBeNull();
    expect(await memberLoans(a.space.id, b.member.id)).toEqual([]);
    expect(await evidenceFor(a.space.slug, { spaceId: a.space.id, loanId })).toEqual([]);
  });
});
