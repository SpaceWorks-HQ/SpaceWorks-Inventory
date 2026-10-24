import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAssets } from "@/lib/catalogue/assets";
import { createItem } from "@/lib/catalogue/items";
import { DomainError } from "@/lib/domainError";
import { evidencePhotoForViewer } from "@/lib/desk/evidence";
import { readHandoverForm, withEvidencePhotos } from "@/lib/desk/photos";
import { scanTarget } from "@/lib/desk/scan";
import { addMember, cleanup, createSpace, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const suffix = uniqueSuffix();
let a: Awaited<ReturnType<typeof seedSpace>>;
let b: { id: string; slug: string };
let otherMember: { id: string };
let bStaff: { id: string };
const storageRoot = path.resolve(process.cwd(), ".data/storage");
const fakePhoto = (spaceId: string) => ({ storageKey: `spaces/${spaceId}/evidence/${crypto.randomUUID()}/p.webp`, contentType: "image/webp", sizeBytes: 10, sha256: "0".repeat(64) });

beforeAll(async () => {
  a = await seedSpace(suffix);
  b = await createSpace(`space-b-${suffix}`, a.owner.id);
  otherMember = await createUser(`other${a.domain}`);
  await addMember(a.space.id, otherMember.id, "MEMBER");
  bStaff = await createUser(`bstaff${a.domain}`);
  await addMember(b.id, bStaff.id, "STAFF");
  await addMember(b.id, a.member.id, "MEMBER");
});
afterAll(async () => {
  for (const id of [a?.space.id, b?.id]) if (id) rmSync(path.join(storageRoot, "spaces", id), { recursive: true, force: true });
  await cleanup([a.space.slug, b.slug], a.domain);
});

describe("evidence photo access", () => {
  it("serves loan photos to staff and the borrower only, from the loan's own space", async () => {
    const item = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Multimeter" }, { userId: null }));
    const loan = await prisma.loan.create({ data: { spaceId: a.space.id, number: 9001, borrowerId: a.member.id, status: "ISSUED", dueAt: new Date(Date.now() + 86_400_000), lines: { create: [{ itemId: item.id, quantityRequested: 1, quantityApproved: 1, quantityIssued: 1 }] } } });
    const evidence = await prisma.evidence.create({ data: { spaceId: a.space.id, kind: "ISSUE", loanId: loan.id, remarks: "", photos: { create: [fakePhoto(a.space.id)] } }, include: { photos: true } });
    const photoId = evidence.photos[0]!.id;
    const view = (spaceId: string, userId: string, role: "STAFF" | "MEMBER" | "MANAGER") => evidencePhotoForViewer({ spaceId, userId, role, photoId });
    expect(await view(a.space.id, a.staff.id, "STAFF")).toMatchObject({ id: photoId });
    expect(await view(a.space.id, a.member.id, "MEMBER")).toMatchObject({ id: photoId });
    expect(await view(a.space.id, otherMember.id, "MEMBER")).toBeNull();
    // Staff of another space, and the borrower viewing through another space, get nothing.
    expect(await view(b.id, bStaff.id, "STAFF")).toBeNull();
    expect(await view(b.id, a.member.id, "MEMBER")).toBeNull();
    expect(await evidencePhotoForViewer({ spaceId: a.space.id, userId: a.staff.id, role: "STAFF", photoId: "nope" })).toBeNull();
  });

  it("serves transfer photos to staff of either side and nobody else", async () => {
    const transfer = await prisma.transfer.create({ data: { number: 9001, sourceSpaceId: a.space.id, destSpaceId: b.id, sourceLocationId: a.shelfA.id, initiatedBySpaceId: a.space.id } });
    const evidence = await prisma.evidence.create({ data: { spaceId: a.space.id, kind: "TRANSFER_DISPATCH", transferId: transfer.id, remarks: "", photos: { create: [fakePhoto(a.space.id)] } }, include: { photos: true } });
    const photoId = evidence.photos[0]!.id;
    expect(await evidencePhotoForViewer({ spaceId: b.id, userId: bStaff.id, role: "STAFF", photoId })).toMatchObject({ id: photoId });
    expect(await evidencePhotoForViewer({ spaceId: a.space.id, userId: a.staff.id, role: "STAFF", photoId })).toMatchObject({ id: photoId });
    expect(await evidencePhotoForViewer({ spaceId: b.id, userId: a.member.id, role: "MEMBER", photoId })).toBeNull();
    const c = await createSpace(`space-c-${suffix}`, a.owner.id);
    try {
      expect(await evidencePhotoForViewer({ spaceId: c.id, userId: a.owner.id, role: "MANAGER", photoId })).toBeNull();
    } finally {
      await cleanup([c.slug], "@nobody.invalid");
    }
  });
});

describe("handover photo storage", () => {
  it("reads the payload and photos from a form", () => {
    const form = new FormData();
    form.set("payload", JSON.stringify({ transferId: "t1" }));
    form.append("photos", new File([new Uint8Array([1])], "a.png", { type: "image/png" }));
    form.append("photos", new File([], "empty.png", { type: "image/png" }));
    const read = readHandoverForm(form);
    expect(read.payload).toEqual({ transferId: "t1" });
    expect(read.photos).toHaveLength(1);
    form.set("payload", "{not json");
    expect(readHandoverForm(form).payload).toBeNull();
  });

  it("stores photos under the space, and deletes them when the handover fails", async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const file = () => new File([new Uint8Array(png)], "p.png", { type: "image/png" });
    let keys: string[] = [];
    await expect(withEvidencePhotos(a.space.id, [file(), file()], async (photos) => {
      keys = photos.map((photo) => photo.storageKey);
      expect(keys.every((key) => key.startsWith(`spaces/${a.space.id}/evidence/`) && existsSync(path.join(storageRoot, key)))).toBe(true);
      throw new DomainError("Refused.");
    })).rejects.toThrow("Refused.");
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => existsSync(path.join(storageRoot, key)))).toBe(false);
    await expect(withEvidencePhotos(a.space.id, [new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" })], async () => "never")).rejects.toThrow(/couldn't be read/);
    await expect(withEvidencePhotos(a.space.id, Array.from({ length: 7 }, file), async () => "never")).rejects.toThrow(/at most 6/);
    expect(await withEvidencePhotos(a.space.id, [file()], async (photos) => photos.length)).toBe(1);
  });
});

describe("scan page resolver", () => {
  it("names what a label is, links to it and lists what holds it", async () => {
    const actor = { userId: null };
    const saw = await prisma.$transaction((tx) => createItem(tx, a.space.id, { name: "Jigsaw", tracking: "SERIALIZED", sku: "JIG" }, actor));
    const [unit] = await prisma.$transaction((tx) => createAssets(tx, a.space.id, { itemId: saw.id, locationId: a.shelfA.id, count: 1 }, actor));
    const loan = await prisma.loan.create({ data: { spaceId: a.space.id, number: 9002, borrowerId: a.member.id, status: "ISSUED", dueAt: new Date(Date.now() + 86_400_000), lines: { create: [{ itemId: saw.id, assetId: unit!.id, quantityRequested: 1, quantityApproved: 1, quantityIssued: 1 }] } } });
    const asset = await scanTarget(a.space.slug, a.space.id, `http://localhost:3100/q/${unit!.qrCode}`);
    expect(asset).toMatchObject({ kind: "asset", href: `/s/${a.space.slug}/assets/${unit!.id}`, status: "Available" });
    expect(asset?.holders).toEqual([{ kind: "loan", label: "LN-9002", status: "On loan", href: `/s/${a.space.slug}/loans/${loan.id}` }]);
    expect(await scanTarget(a.space.slug, a.space.id, saw.qrCode)).toMatchObject({ kind: "item", href: `/s/${a.space.slug}/items/${saw.id}`, holders: [{ label: "LN-9002" }] });
    expect(await scanTarget(a.space.slug, a.space.id, a.shelfB.qrCode)).toMatchObject({ kind: "location", label: "Shelf B (R1-B)", holders: [] });
    // Another space's label reads exactly like an unknown one.
    expect(await scanTarget(b.slug, b.id, unit!.qrCode)).toBeNull();
    expect(await scanTarget(a.space.slug, a.space.id, "not a code")).toBeNull();
  });
});
