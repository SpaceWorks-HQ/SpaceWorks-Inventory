import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { newQrCode } from "@/lib/catalogue/qr";
import { saveSupplier } from "@/lib/catalogue/taxonomy";
import { receiveStock } from "@/lib/inventory/availability";
import { requestTransfer } from "@/lib/transfers/workflow";
import { replaceSpaceLogo } from "@/lib/setup/branding";
import { deleteSpace, saveSettingsSection, setSupplierArchived } from "@/lib/setup/settings";
import { addMember, cleanup, createSpace, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
const extraSlugs: string[] = [];

beforeAll(async () => { ctx = await seedSpace(suffix); });
afterAll(async () => { await cleanup([ctx.space.slug, ...extraSlugs], ctx.domain); });

const audits = (spaceId: string, action: string) => prisma.auditEvent.findMany({ where: { spaceId, action }, orderBy: { createdAt: "asc" } });

describe("settings sections", () => {
  it("saves a section and audits the changed field names only", async () => {
    const result = await saveSettingsSection(prisma, ctx.space, "lending", {
      lendingEnabled: true, publicCatalogue: true, selfCheckoutEnabled: false, defaultLoanDays: 10, maxLoanDays: 30,
      maxActiveLoans: 5, maxItemsOnLoan: 0, maxRenewals: 1, renewalDays: 7, reminderDaysBefore: 1, overdueReminderDays: 2,
    }, ctx.owner.id);
    expect(result).toEqual({ ok: true, changed: ["publicCatalogue", "defaultLoanDays"] });
    const space = await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } });
    expect(space).toMatchObject({ publicCatalogue: true, defaultLoanDays: 10 });
    const [audit] = await audits(ctx.space.id, "settings.updated");
    expect(audit).toMatchObject({ actorId: ctx.owner.id, targetType: "Space", metadata: { section: "lending", fields: "publicCatalogue,defaultLoanDays" } });
  });

  it("writes nothing when nothing changed", async () => {
    const before = (await audits(ctx.space.id, "settings.updated")).length;
    const result = await saveSettingsSection(prisma, ctx.space, "network", { acceptsTransfers: true, shareStockWithSpaces: true }, ctx.owner.id);
    expect(result).toEqual({ ok: true, changed: [] });
    expect(await audits(ctx.space.id, "settings.updated")).toHaveLength(before);
  });

  it("refuses invalid input with field errors", async () => {
    const result = await saveSettingsSection(prisma, ctx.space, "lending", {
      lendingEnabled: true, publicCatalogue: true, selfCheckoutEnabled: false, defaultLoanDays: 40, maxLoanDays: 30,
      maxActiveLoans: 5, maxItemsOnLoan: 0, maxRenewals: 1, renewalDays: 7, reminderDaysBefore: 1, overdueReminderDays: 2,
    }, ctx.owner.id);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors?.defaultLoanDays?.[0]).toMatch(/longest loan/);
    expect((await saveSettingsSection(prisma, ctx.space, "nope", {}, ctx.owner.id)).ok).toBe(false);
    expect((await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } })).defaultLoanDays).toBe(10);
  });

  it("refuses an asset tag prefix another space already uses", async () => {
    const otherOwner = await createUser(`prefix-owner${ctx.domain}`, "Prefix owner");
    const other = await createSpace(`prefix-${suffix}`, otherOwner.id);
    extraSlugs.push(other.slug);
    const general = { name: ctx.space.name, tagline: "", address: "", contactEmail: "", timezone: ctx.space.timezone, currency: ctx.space.currency };
    const taken = await saveSettingsSection(prisma, ctx.space, "general", { ...general, tagPrefix: other.tagPrefix }, ctx.owner.id);
    expect(taken).toEqual({ ok: false, error: "Another space already uses this prefix.", fieldErrors: { tagPrefix: ["Another space already uses this prefix."] } });
    const fresh = `Q${suffix.replace(/[^A-Za-z0-9]/g, "").slice(0, 5)}`.toUpperCase();
    expect(await saveSettingsSection(prisma, ctx.space, "general", { ...general, tagPrefix: fresh }, ctx.owner.id)).toMatchObject({ ok: true, changed: ["tagPrefix"] });
    expect((await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } })).tagPrefix).toBe(fresh);
  });

  it("saves nullable inventory thresholds", async () => {
    const result = await saveSettingsSection(prisma, ctx.space, "inventory", {
      internalTransferApproval: false, labelSize: "LARGE", labelShowName: true, labelShowLocation: true, defaultReorderPoint: 3, countVarianceThreshold: null, repairRequestDays: 10,
    }, ctx.staff.id);
    expect(result.ok).toBe(true);
    expect(await prisma.space.findUniqueOrThrow({ where: { id: ctx.space.id } })).toMatchObject({ labelSize: "LARGE", defaultReorderPoint: 3, countVarianceThreshold: null, repairRequestDays: 10 });
  });

  it("replaces the logo key and reports the previous one", async () => {
    expect(await replaceSpaceLogo(ctx.space.id, `spaces/${ctx.space.id}/items/a/logo.webp`, ctx.owner.id)).toEqual({ previousKey: null });
    expect(await replaceSpaceLogo(ctx.space.id, null, ctx.owner.id)).toEqual({ previousKey: `spaces/${ctx.space.id}/items/a/logo.webp` });
    expect((await audits(ctx.space.id, "space.logo_updated"))).toHaveLength(1);
    expect((await audits(ctx.space.id, "space.logo_removed"))).toHaveLength(1);
  });

  it("archives and restores a supplier in its own space only", async () => {
    const supplier = await prisma.$transaction((tx) => saveSupplier(tx, ctx.space.id, null, { name: "Robu" }, { userId: ctx.owner.id }));
    await prisma.$transaction((tx) => setSupplierArchived(tx, ctx.space.id, supplier.id, true, { userId: ctx.owner.id }));
    expect((await prisma.supplier.findUniqueOrThrow({ where: { id: supplier.id } })).archivedAt).not.toBeNull();
    await expect(prisma.$transaction((tx) => setSupplierArchived(tx, "other-space", supplier.id, false, { userId: ctx.owner.id }))).rejects.toThrow(/wasn't found/);
  });
});

describe("deleting a space", () => {
  it("refuses while a transfer with another space is open, then removes everything and keeps an instance audit row", async () => {
    const owner = await createUser(`deleter${ctx.domain}`, "Deleter");
    const doomed = await createSpace(`doomed-${suffix}`, owner.id);
    extraSlugs.push(doomed.slug);
    await addMember(doomed.id, ctx.member.id, "MEMBER");
    const shelf = await prisma.location.create({ data: { spaceId: doomed.id, name: "Shelf", code: "S1", kind: "SHELF", qrCode: newQrCode("location") } });
    const item = await prisma.$transaction((tx) => createItem(tx, doomed.id, { name: "Glue gun" }, { userId: owner.id }));
    await prisma.$transaction((tx) => receiveStock(tx, { spaceId: doomed.id, itemId: item.id, locationId: shelf.id, quantity: 4 }, { userId: owner.id }));
    const transfer = await prisma.$transaction((tx) => requestTransfer(tx, {
      sourceSpaceId: doomed.id, destSpaceId: ctx.space.id, sourceLocationId: shelf.id, destLocationId: null, initiatedBySpaceId: doomed.id,
      lines: [{ itemId: item.id, quantity: 1 }], reason: null, neededBy: null,
    }, { userId: owner.id }));
    await expect(deleteSpace(doomed.id, owner.id)).rejects.toThrow(/open transfers/);
    await prisma.transfer.delete({ where: { id: transfer.id } });

    const result = await deleteSpace(doomed.id, owner.id);
    expect(result.storageKeys).toEqual([]);
    expect(await prisma.space.findUnique({ where: { id: doomed.id } })).toBeNull();
    expect(await prisma.item.count({ where: { spaceId: doomed.id } })).toBe(0);
    expect(await prisma.membership.count({ where: { spaceId: doomed.id } })).toBe(0);
    const audit = await prisma.auditEvent.findFirst({ where: { action: "space.deleted", targetId: doomed.id } });
    expect(audit).toMatchObject({ spaceId: null, actorId: owner.id, metadata: { slug: doomed.slug, name: doomed.name } });
    await prisma.auditEvent.deleteMany({ where: { action: "space.deleted", targetId: doomed.id } });
  });
});
