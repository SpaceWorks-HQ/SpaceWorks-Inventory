import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newQrCode } from "@/lib/catalogue/qr";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import { availabilityFor, availabilityOf, receiveStock } from "@/lib/inventory/availability";
import {
  acceptRepairRequest, addExternalTechnician, addStaffTechnician, approveRepairAmount, assignTechnician, cancelIssue, closeRepair, findLinkRequest, listRepairs, recordRepairPayout,
  recordRepairWork, repairDetail, repairFilter, repairViewer, reportIssue, sendRepairRequests,
} from "@/lib/repairs";
import { addMember, cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let other: Awaited<ReturnType<typeof seedSpace>>;
let itemId: string;
const tx = <T>(fn: (client: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn);
const manager = () => ({ userId: ctx.owner.id });
const contact = { phone: null, whatsapp: null, telegramChatId: null, skills: [], preferredChannel: null, notes: null };
const report = (overrides: Partial<Parameters<typeof reportIssue>[1]> = {}) => tx((client) => reportIssue(client, { spaceId: ctx.space.id, itemId, assetId: null, title: "Broken", description: "It broke.", severity: "MEDIUM", takeOutOfUse: false, quantity: 0, locationId: null, photos: [], ...overrides }, { userId: ctx.staff.id }));
const available = async () => availabilityOf(await availabilityFor(ctx.space.id, [itemId]), itemId).available;

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  other = await seedSpace(`${suffix}b`);
  const item = await prisma.item.create({ data: { spaceId: ctx.space.id, sku: `RP-${suffix}`, name: "Glue gun", qrCode: newQrCode("item") } });
  itemId = item.id;
  await tx((client) => receiveStock(client, { spaceId: ctx.space.id, itemId, locationId: ctx.shelfA.id, quantity: 5 }, { userId: ctx.owner.id }));
  await prisma.spaceChatConfig.create({ data: { spaceId: ctx.space.id, telegramBotTokenEnc: encryptSecret("chat-secrets", "123456:abcdefghijklmnopqrstuvwxyzABCDEFG") } });
});
afterAll(async () => { await cleanup([ctx.space.slug, other.space.slug], ctx.domain); await cleanup([], other.domain); });

describe("stock held for repair", () => {
  it("quarantines through the availability module and releases on close, scrap and cancel", async () => {
    expect(await available()).toBe(5);
    const fixedOne = await report({ takeOutOfUse: true, quantity: 2, locationId: ctx.shelfA.id });
    expect(await available()).toBe(3);
    const scrapped = await report({ takeOutOfUse: true, quantity: 1, locationId: ctx.shelfA.id });
    const cancelled = await report({ takeOutOfUse: true, quantity: 1, locationId: ctx.shelfA.id });
    expect(await available()).toBe(1);
    await expect(report({ takeOutOfUse: true, quantity: 2, locationId: ctx.shelfA.id })).rejects.toThrow();
    await tx((client) => cancelIssue(client, { spaceId: ctx.space.id, issueId: cancelled.id, reason: "Duplicate" }, manager()));
    await tx((client) => closeRepair(client, { spaceId: ctx.space.id, issueId: scrapped.id, outcome: "SCRAPPED", note: "Beyond repair" }, manager()));
    expect(await available()).toBe(2);
    const technician = await tx((client) => addExternalTechnician(client, ctx.space.id, { ...contact, name: "Fixer", email: `fixer${ctx.domain}` }, ctx.owner.id));
    await tx((client) => assignTechnician(client, { spaceId: ctx.space.id, issueId: fixedOne.id, technicianId: technician.id }, manager()));
    await expect(tx((client) => closeRepair(client, { spaceId: ctx.space.id, issueId: fixedOne.id, outcome: "FIXED", note: "" }, manager()))).rejects.toThrow("marked fixed");
    await tx((client) => recordRepairWork(client, { spaceId: ctx.space.id, issueId: fixedOne.id, remarks: "Rewired", partsUsed: null, amountAskedMinor: 800, photos: [], markFixed: true }, { userId: null, technicianId: technician.id }));
    await tx((client) => closeRepair(client, { spaceId: ctx.space.id, issueId: fixedOne.id, outcome: "FIXED", note: "" }, manager()));
    expect(await available()).toBe(4);
    const levels = await prisma.stockLevel.findMany({ where: { itemId } });
    expect(levels.reduce((sum, level) => sum + level.quarantined, 0)).toBe(0);
  });
});

describe("requests to technicians", () => {
  it("fans out on every channel, lets the first accept win and closes the other links", async () => {
    const memberUser = await createUser(`tech${ctx.domain}`, "Tara Tech");
    await addMember(ctx.space.id, memberUser.id, "TECHNICIAN");
    const staffTech = await tx((client) => addStaffTechnician(client, ctx.space.id, { userId: memberUser.id, ...contact, telegramChatId: "123456789" }, ctx.owner.id));
    const external = await tx((client) => addExternalTechnician(client, ctx.space.id, { ...contact, name: "Outside", email: `outside${ctx.domain}`, whatsapp: "+919800000009", telegramChatId: "987654321" }, ctx.owner.id));
    const second = await tx((client) => addExternalTechnician(client, ctx.space.id, { ...contact, name: "Second", email: `second${ctx.domain}` }, ctx.owner.id));
    const issue = await report();
    await tx((client) => sendRepairRequests(client, { spaceId: ctx.space.id, issueId: issue.id, technicianIds: [staffTech.id, external.id, second.id] }, manager()));
    const requests = await prisma.repairRequest.findMany({ where: { issueId: issue.id }, orderBy: { technicianId: "asc" } });
    const byTech = new Map(requests.map((request) => [request.technicianId, request]));
    expect(byTech.get(staffTech.id)!.channels.sort()).toEqual(["EMAIL", "INBOX", "TELEGRAM"]);
    expect(byTech.get(staffTech.id)!.tokenHash).toBeNull();
    // WhatsApp isn't configured for this space, so it is skipped quietly.
    expect(byTech.get(external.id)!.channels.sort()).toEqual(["EMAIL", "TELEGRAM"]);
    const emails = await prisma.outboxMessage.findMany({ where: { kind: "repair-request", payload: { path: ["to"], equals: `outside${ctx.domain}` } } });
    expect(emails).toHaveLength(1);
    const token = (emails[0]!.payload as { linkUrl: string }).linkUrl.split("/r/")[1]!;
    expect((await findLinkRequest(token))?.mode).toBe("respond");
    expect(await prisma.notification.count({ where: { userId: memberUser.id, kind: "repair.requested" } })).toBe(1);

    const results = await Promise.allSettled([
      tx((client) => acceptRepairRequest(client, { spaceId: ctx.space.id, requestId: byTech.get(external.id)!.id }, { userId: null, technicianId: external.id })),
      tx((client) => acceptRepairRequest(client, { spaceId: ctx.space.id, requestId: byTech.get(second.id)!.id }, { userId: null, technicianId: second.id })),
      tx((client) => acceptRepairRequest(client, { spaceId: ctx.space.id, requestId: byTech.get(staffTech.id)!.id }, { userId: memberUser.id, technicianId: staffTech.id })),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const assigned = await prisma.repairIssue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(assigned.status).toBe("ASSIGNED");
    const after = await prisma.repairRequest.findMany({ where: { issueId: issue.id } });
    expect(after.filter((request) => request.status === "ACCEPTED").map((request) => request.technicianId)).toEqual([assigned.assignedTechnicianId]);
    expect(after.filter((request) => request.status === "CLOSED")).toHaveLength(2);
    if (assigned.assignedTechnicianId !== external.id) expect(await findLinkRequest(token)).toBeNull();
    else expect((await findLinkRequest(token))?.mode).toBe("work");
  });

  it("closes an expired link and keeps every repair inside its space", async () => {
    const external = await prisma.technician.findFirstOrThrow({ where: { spaceId: ctx.space.id, name: "Second" } });
    const issue = await report();
    await tx((client) => sendRepairRequests(client, { spaceId: ctx.space.id, issueId: issue.id, technicianIds: [external.id] }, manager()));
    const request = await prisma.repairRequest.findFirstOrThrow({ where: { issueId: issue.id } });
    await prisma.repairRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(tx((client) => acceptRepairRequest(client, { spaceId: ctx.space.id, requestId: request.id }, { userId: null, technicianId: external.id }))).rejects.toThrow("expired");
    await expect(tx((client) => sendRepairRequests(client, { spaceId: other.space.id, issueId: issue.id, technicianIds: [external.id] }, { userId: other.owner.id }))).rejects.toThrow("wasn't found");
    const foreign = await prisma.technician.create({ data: { spaceId: other.space.id, kind: "EXTERNAL", name: "Foreign", email: `foreign${ctx.domain}` } });
    await expect(tx((client) => assignTechnician(client, { spaceId: ctx.space.id, issueId: issue.id, technicianId: foreign.id }, manager()))).rejects.toThrow("wasn't found");
    const outsider = await repairViewer(other.space.id, other.owner, { role: "MANAGER" });
    expect(await repairDetail({ id: other.space.id, slug: other.space.slug, timezone: "Asia/Kolkata" }, outsider, issue.id)).toBeNull();
  });
});

describe("paying for a repair", () => {
  it("approves, pays in parts up to the approved amount and posts each payout to the ledger", async () => {
    const technician = await prisma.technician.findFirstOrThrow({ where: { spaceId: ctx.space.id, name: "Fixer" } });
    const issue = await report();
    await tx((client) => assignTechnician(client, { spaceId: ctx.space.id, issueId: issue.id, technicianId: technician.id }, manager()));
    await tx((client) => recordRepairWork(client, { spaceId: ctx.space.id, issueId: issue.id, remarks: "Done", partsUsed: null, amountAskedMinor: 1_000, photos: [], markFixed: true }, { userId: null, technicianId: technician.id }));
    const payout = { spaceId: ctx.space.id, issueId: issue.id, method: "UPI" as const, reference: "UPI-1", paidAt: new Date(), note: null };
    await expect(tx((client) => recordRepairPayout(client, { ...payout, amountMinor: 500 }, manager()))).rejects.toThrow("Approve the amount");
    await expect(tx((client) => approveRepairAmount(client, { spaceId: ctx.space.id, issueId: issue.id, amountMinor: 900, note: null }, manager()))).rejects.toThrow("differs");
    await tx((client) => approveRepairAmount(client, { spaceId: ctx.space.id, issueId: issue.id, amountMinor: 900, note: "Parts were ours" }, manager()));
    const first = await tx((client) => recordRepairPayout(client, { ...payout, amountMinor: 400 }, manager()));
    await expect(tx((client) => recordRepairPayout(client, { ...payout, amountMinor: 600 }, manager()))).rejects.toThrow("left to pay");
    await expect(tx((client) => recordRepairPayout(client, { ...payout, amountMinor: 500, reference: null }, manager()))).rejects.toThrow("reference");
    await tx((client) => recordRepairPayout(client, { ...payout, amountMinor: 500, method: "CASH", reference: null }, manager()));
    const entries = await prisma.financeEntry.findMany({ where: { spaceId: ctx.space.id, category: "REPAIR", technicianId: technician.id } });
    expect(entries.map((entry) => entry.amountMinor).sort()).toEqual([400, 500]);
    await expect(prisma.repairPayout.update({ where: { id: first.id }, data: { amountMinor: 1 } })).rejects.toThrow(/append-only/);

    // Money is for managers; the technician sees only what they asked and whether it is paid.
    const space = { id: ctx.space.id, slug: ctx.space.slug, timezone: "Asia/Kolkata" };
    const asManager = await repairDetail(space, await repairViewer(ctx.space.id, ctx.owner, { role: "MANAGER" }), issue.id);
    expect(asManager?.money).toMatchObject({ askedMinor: 1_000, approvedMinor: 900, paidMinor: 900, payout: "PAID" });
    const asStaff = await repairDetail(space, await repairViewer(ctx.space.id, ctx.staff, { role: "STAFF" }), issue.id);
    expect(asStaff?.money).toBeNull();
    expect(asStaff?.timeline.some((event) => event.kind === "paid" || event.kind === "approved")).toBe(false);
    const list = await listRepairs(space, await repairViewer(ctx.space.id, ctx.member, { role: "MEMBER" }), repairFilter("closed"));
    expect(list.rows).toEqual([]);
  });
});
