import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => (session.userId ? { user: { id: session.userId } } : null)) }));

import { GET as privateImage } from "@/app/api/s/[spaceSlug]/images/[imageId]/route";
import { GET as publicImageRoute } from "@/app/api/public/[spaceSlug]/images/[imageId]/route";
import { createItem } from "@/lib/catalogue/items";
import { addItemImages, MAX_ITEM_IMAGES, removeItemImage, reorderItemImages } from "@/lib/catalogue/images";
import { prisma } from "@/lib/db";
import { deleteObjects, getObject } from "@/lib/storage";
import { cleanup, createUser, seedSpace, uniqueSuffix } from "../helpers/fixtures";
import type { NextRequest } from "next/server";

const suffix = uniqueSuffix();
let ctx: Awaited<ReturnType<typeof seedSpace>>;
let outsider: { id: string };
let png: Buffer;

const file = (name = "photo.png") => new File([new Uint8Array(png)], name, { type: "image/png" });
const call = (route: typeof publicImageRoute, slug: string, imageId: string) =>
  route(new Request(`http://localhost/x/${imageId}`, { headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` } }) as NextRequest, { params: Promise.resolve({ spaceSlug: slug, imageId }) });

beforeAll(async () => {
  ctx = await seedSpace(suffix);
  outsider = await createUser(`outsider${ctx.domain}`);
  png = await sharp({ create: { width: 12, height: 8, channels: 3, background: { r: 0, g: 110, b: 99 } } }).png().toBuffer();
});
afterAll(async () => {
  const stored = await prisma.itemImage.findMany({ where: { spaceId: ctx.space.id }, select: { storageKey: true } });
  await deleteObjects(stored.map((row) => row.storageKey));
  await cleanup([ctx.space.slug], ctx.domain);
});
beforeEach(() => { session.userId = null; });

async function item(name: string, extra: Record<string, unknown> = {}) {
  return prisma.$transaction((tx) => createItem(tx, ctx.space.id, { name, ...extra }, { userId: null }));
}

describe("item images", () => {
  it("stores a re-encoded WebP, serves it to members only and deletes it", async () => {
    const drill = await item("Drill");
    const [row] = await addItemImages(ctx.space.id, drill.id, [file()], { userId: ctx.owner.id });
    const image = await prisma.itemImage.findUniqueOrThrow({ where: { id: row!.id } });
    expect(image).toMatchObject({ contentType: "image/webp", width: 12, height: 8, sortOrder: 0 });
    expect(image.storageKey.startsWith(`spaces/${ctx.space.id}/items/`)).toBe(true);
    expect(await getObject(image.storageKey)).not.toBeNull();
    expect(await prisma.auditEvent.count({ where: { spaceId: ctx.space.id, action: "item.images_added", targetId: drill.id } })).toBe(1);

    expect((await call(privateImage, ctx.space.slug, image.id)).status).toBe(404);
    session.userId = outsider.id;
    expect((await call(privateImage, ctx.space.slug, image.id)).status).toBe(404);
    session.userId = ctx.member.id;
    const served = await call(privateImage, ctx.space.slug, image.id);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/webp");
    expect(served.headers.get("cache-control")).toBe("private, max-age=300");
    expect((await sharp(Buffer.from(await served.arrayBuffer())).metadata()).format).toBe("webp");

    await removeItemImage(ctx.space.id, image.id, { userId: ctx.owner.id });
    expect(await prisma.itemImage.count({ where: { id: image.id } })).toBe(0);
    expect(await getObject(image.storageKey)).toBeNull();
    expect((await call(privateImage, ctx.space.slug, image.id)).status).toBe(404);
  });

  it("serves public photos only for a public catalogue and a lendable, active item", async () => {
    const lendable = await item("Glue gun", { lendable: true });
    const internal = await item("Spare fuse");
    const [shown] = await addItemImages(ctx.space.id, lendable.id, [file()], { userId: null });
    const [hidden] = await addItemImages(ctx.space.id, internal.id, [file()], { userId: null });
    expect((await call(publicImageRoute, ctx.space.slug, shown!.id)).status).toBe(404);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { publicCatalogue: true } });
    const response = await call(publicImageRoute, ctx.space.slug, shown!.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await call(publicImageRoute, ctx.space.slug, hidden!.id)).status).toBe(404);
    expect((await call(publicImageRoute, "another-space", shown!.id)).status).toBe(404);
    await prisma.item.update({ where: { id: lendable.id }, data: { archivedAt: new Date() } });
    expect((await call(publicImageRoute, ctx.space.slug, shown!.id)).status).toBe(404);
    await prisma.space.update({ where: { id: ctx.space.id }, data: { publicCatalogue: false } });
  });

  it("reorders photos and refuses more than six without leaving stored objects behind", async () => {
    const saw = await item("Saw");
    const rows = await addItemImages(ctx.space.id, saw.id, [file("a.png"), file("b.png"), file("c.png")], { userId: null });
    const reversed = rows.map((row) => row.id).reverse();
    await reorderItemImages(ctx.space.id, saw.id, reversed, { userId: null });
    expect((await prisma.itemImage.findMany({ where: { itemId: saw.id }, orderBy: { sortOrder: "asc" } })).map((row) => row.id)).toEqual(reversed);
    await expect(reorderItemImages(ctx.space.id, saw.id, reversed.slice(1), { userId: null })).rejects.toThrow(/Reload/);

    const before = await prisma.itemImage.count({ where: { spaceId: ctx.space.id } });
    await expect(addItemImages(ctx.space.id, saw.id, Array.from({ length: MAX_ITEM_IMAGES - 2 }, () => file()), { userId: null })).rejects.toThrow(/at most 6/);
    expect(await prisma.itemImage.count({ where: { spaceId: ctx.space.id } })).toBe(before);
    await expect(addItemImages(ctx.space.id, saw.id, [new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" })], { userId: null })).rejects.toThrow(/couldn't be read/);
  });

  it("keeps photos inside their space", async () => {
    const other = await seedSpace(uniqueSuffix());
    try {
      const mine = await item("Clamp");
      const [row] = await addItemImages(ctx.space.id, mine.id, [file()], { userId: null });
      await expect(addItemImages(other.space.id, mine.id, [file()], { userId: null })).rejects.toThrow(/wasn't found/);
      await expect(removeItemImage(other.space.id, row!.id, { userId: null })).rejects.toThrow(/wasn't found/);
      session.userId = other.owner.id;
      expect((await call(privateImage, other.space.slug, row!.id)).status).toBe(404);
    } finally {
      await cleanup([other.space.slug], other.domain);
    }
  });
});
