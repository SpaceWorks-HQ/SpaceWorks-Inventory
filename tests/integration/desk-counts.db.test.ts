import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { createAssets } from "@/lib/catalogue/assets";
import { newQrCode } from "@/lib/catalogue/qr";
import { receiveStock } from "@/lib/inventory/availability";
import { listCounts, listSchedules } from "@/lib/desk/counts";
import { countDetail } from "@/lib/desk/countsDetail";
import { addCountLineStep, countTransitionStep, recordCountStep, refreshCountLineStep, saveScheduleStep, scanCountStep, setScheduleActiveStep, startCountStep } from "@/lib/desk/countSteps";
import { cleanup, createSpace, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: { id: string; slug: string };
let bShelf: { id: string };
const system = { userId: null };

beforeAll(async () => {
  a = await seedSpace(suffix);
  b = await createSpace(`space-b-${suffix}`, a.owner.id);
  bShelf = await prisma.location.create({ data: { spaceId: b.id, name: "B shelf", code: "BS", kind: "SHELF", qrCode: newQrCode("location") } });
});
afterAll(async () => { await cleanup([a.space.slug, b.slug], a.domain); });

async function stocked(spaceId: string, name: string, locationId: string, quantity: number, extra: Record<string, unknown> = {}) {
  const item = await prisma.$transaction((tx) => createItem(tx, spaceId, { name, ...extra }, system));
  if (quantity) await prisma.$transaction((tx) => receiveStock(tx, { spaceId, itemId: item.id, locationId, quantity }, system));
  return item;
}
const staff = () => ({ spaceId: a.space.id, actorId: a.staff.id });
const owner = () => ({ spaceId: a.space.id, actorId: a.owner.id });

describe("count read model", () => {
  it("hides expected quantities of a blind count until it is submitted, then shows variances and the four-eyes block", async () => {
    const tape = await stocked(a.space.id, "Gaffer tape", a.shelfA.id, 5);
    const count = await startCountStep(owner(), { name: "Room", locationId: a.room.id, categoryId: null, blind: true });
    const open = await countDetail(a.space.id, count.id, a.staff.id);
    const line = open!.lines.find((l) => l.itemId === tape.id)!;
    expect(open!.showsExpected).toBe(false);
    expect(line).toMatchObject({ expected: null, variance: null, locationPath: "Room › Shelf A", stale: false });
    expect(JSON.stringify(open)).not.toContain('"expectedQty"');

    await recordCountStep(staff(), { countId: count.id, lineId: line.id, counted: 4, note: null });
    await countTransitionStep(staff(), "submit", count.id);
    const submitted = await countDetail(a.space.id, count.id, a.staff.id);
    expect(submitted!.lines.find((l) => l.id === line.id)).toMatchObject({ expected: 5, variance: -1, countedQty: 4, counterName: "Staff" });
    expect(submitted!.fourEyes).toMatchObject({ overThreshold: true, involved: true, blocked: true });
    expect((await countDetail(a.space.id, count.id, a.member.id))!.fourEyes.blocked).toBe(false);

    // The owner started it too, so the domain refuses both counters; a third person must post.
    await expect(countTransitionStep(staff(), "post", count.id)).rejects.toThrow(/didn't count/);
    const manager = await prisma.user.create({ data: { email: `manager${a.domain}`, name: "Manager" } });
    await prisma.membership.create({ data: { spaceId: a.space.id, userId: manager.id, role: "MANAGER" } });
    await countTransitionStep({ spaceId: a.space.id, actorId: manager.id }, "post", count.id);
    expect((await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId: tape.id, locationId: a.shelfA.id } } })).onHand).toBe(4);
    expect((await listCounts(a.space.id, "posted")).map((c) => c.id)).toContain(count.id);
  });

  it("flags stale lines, refreshes them and records scans and unexpected lines", async () => {
    const solder = await stocked(a.space.id, "Solder", a.shelfB.id, 3);
    const drill = await stocked(a.space.id, "Cordless drill", a.shelfB.id, 0, { tracking: "SERIALIZED" });
    const [d1] = await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: drill.id, locationId: a.shelfB.id, count: 2 }, system));
    const count = await startCountStep(owner(), { name: "Shelf B", locationId: a.shelfB.id, categoryId: null, blind: false });
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: a.space.id, itemId: solder.id, locationId: a.shelfB.id, quantity: 2 }, system));
    let detail = await countDetail(a.space.id, count.id, a.staff.id);
    const line = detail!.lines.find((l) => l.itemId === solder.id)!;
    expect(line).toMatchObject({ stale: true, expected: 3 });
    expect(detail!.totals.stale).toBe(0);
    await refreshCountLineStep(staff(), { countId: count.id, lineId: line.id });
    detail = await countDetail(a.space.id, count.id, a.staff.id);
    expect(detail!.lines.find((l) => l.id === line.id)).toMatchObject({ stale: false, expected: 5 });

    const scanned = await scanCountStep(staff(), { countId: count.id, code: d1!.qrCode, locationId: a.shelfB.id });
    expect(scanned.label).toContain("Cordless drill");
    await addCountLineStep(staff(), { countId: count.id, itemId: solder.id, locationId: a.shelfA.id, counted: 1 });
    detail = await countDetail(a.space.id, count.id, a.staff.id);
    expect(detail!.lines.find((l) => l.itemId === drill.id && l.locationId === a.shelfB.id)).toMatchObject({ serialized: true, scannedTags: [d1!.assetTag], expected: 2, variance: -1 });
    expect(detail!.lines.find((l) => l.itemId === solder.id && l.locationId === a.shelfA.id)).toMatchObject({ countedQty: 1, expected: 0, variance: 1 });
    await countTransitionStep(owner(), "cancel", count.id);
  });
});

describe("count tenancy", () => {
  it("never shows or acts on another space's count", async () => {
    const bItem = await stocked(b.id, "B glue", bShelf.id, 2);
    const bCount = await startCountStep({ spaceId: b.id, actorId: a.owner.id }, { name: "B count", locationId: null, categoryId: null, blind: true });
    const bLine = await prisma.stockCountLine.findFirstOrThrow({ where: { countId: bCount.id, itemId: bItem.id } });
    expect(await countDetail(a.space.id, bCount.id, a.staff.id)).toBeNull();
    expect((await listCounts(a.space.id, "all")).map((c) => c.id)).not.toContain(bCount.id);
    await expect(recordCountStep(staff(), { countId: bCount.id, lineId: bLine.id, counted: 9, note: null })).rejects.toThrow(/wasn't found/);
    await expect(countTransitionStep(owner(), "cancel", bCount.id)).rejects.toThrow(/wasn't found/);
    await expect(refreshCountLineStep(staff(), { countId: bCount.id, lineId: bLine.id })).rejects.toThrow(/isn't open/);
    await expect(addCountLineStep(staff(), { countId: bCount.id, itemId: bItem.id, locationId: bShelf.id, counted: 1 })).rejects.toThrow(/wasn't found/);
    expect((await prisma.stockCountLine.findUniqueOrThrow({ where: { id: bLine.id } })).countedQty).toBeNull();
  });
});

describe("count schedules", () => {
  it("creates, pauses and resumes a schedule without moving its next run", async () => {
    const id = await saveScheduleStep({ ...owner(), timeZone: "Asia/Kolkata" }, { name: "Weekly shelf A", locationId: a.shelfA.id, categoryId: null, everyDays: 7, blind: true, firstRunDate: "2030-01-15" });
    const before = await prisma.countSchedule.findUniqueOrThrow({ where: { id } });
    expect(before.nextRunAt.toISOString()).toBe("2030-01-15T03:30:00.000Z");
    expect(await prisma.auditEvent.findFirst({ where: { spaceId: a.space.id, targetId: id, action: "count.schedule_created" } }))
      .toMatchObject({ actorId: a.owner.id, targetType: "CountSchedule", metadata: { fields: "name,locationId,categoryId,everyDays,blind,active,nextRunAt" } });
    await setScheduleActiveStep(owner(), { scheduleId: id, active: false });
    const paused = await prisma.countSchedule.findUniqueOrThrow({ where: { id } });
    expect(paused).toMatchObject({ active: false, nextRunAt: before.nextRunAt });
    expect(await prisma.auditEvent.findMany({ where: { spaceId: a.space.id, targetId: id, action: "count.schedule_updated" } }))
      .toMatchObject([{ actorId: a.owner.id, metadata: { fields: "active" } }]);
    const listed = (await listSchedules(a.space.id)).find((s) => s.id === id);
    expect(listed).toMatchObject({ active: false, everyDays: 7, scope: "Room › Shelf A and below" });
    await setScheduleActiveStep(owner(), { scheduleId: id, active: true });
    expect(await prisma.countSchedule.findUniqueOrThrow({ where: { id } })).toMatchObject({ active: true, nextRunAt: before.nextRunAt });
    expect(await prisma.auditEvent.findMany({ where: { spaceId: a.space.id, targetId: id, action: "count.schedule_updated" } }))
      .toMatchObject([{ actorId: a.owner.id, metadata: { fields: "active" } }, { actorId: a.owner.id, metadata: { fields: "active" } }]);
    const bSchedule = await saveScheduleStep({ spaceId: b.id, actorId: a.owner.id, timeZone: "UTC" }, { name: "B weekly", locationId: null, categoryId: null, everyDays: 7, blind: false, firstRunDate: "" });
    await expect(setScheduleActiveStep(owner(), { scheduleId: bSchedule, active: false })).rejects.toThrow(/wasn't found/);
    await expect(saveScheduleStep({ ...owner(), timeZone: "UTC" }, { name: "Foreign shelf", locationId: bShelf.id, categoryId: null, everyDays: 7, blind: false, firstRunDate: "" })).rejects.toThrow(/wasn't found/);
  });
});
