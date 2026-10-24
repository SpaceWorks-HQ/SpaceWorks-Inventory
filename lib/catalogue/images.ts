import "server-only";

import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { DomainError, notFound } from "@/lib/domainError";
import { deleteObjects, storeImage, type StoredImage } from "@/lib/storage";

/** Item photos: up to six per item, stored as WebP and served through membership-checked routes. */
export const MAX_ITEM_IMAGES = 6;

type Actor = { userId: string | null };

/**
 * Store the photos first (decode, resize, strip metadata, re-encode), then
 * add the rows in one transaction. If anything fails, the stored objects are
 * deleted again so storage never keeps orphans.
 */
export async function addItemImages(spaceId: string, itemId: string, files: File[], actor: Actor) {
  if (files.length === 0) throw new DomainError("Choose at least one photo.", "invalid");
  const item = await prisma.item.findFirst({ where: { id: itemId, spaceId }, select: { id: true, _count: { select: { images: true } } } });
  if (!item) notFound("item");
  if (item._count.images + files.length > MAX_ITEM_IMAGES) throw new DomainError(`An item can have at most ${MAX_ITEM_IMAGES} photos.`, "invalid");
  const stored: StoredImage[] = [];
  try {
    for (const file of files) {
      const result = await storeImage({ spaceId, folder: "items", file, maxSide: 1600 });
      if (!result.ok) throw new DomainError(result.error, "invalid");
      stored.push(result.image);
    }
    return await prisma.$transaction(async (tx) => {
      // Lock the item so two uploads at once can't pass the limit together.
      await tx.$queryRaw`SELECT "id" FROM "Item" WHERE "id" = ${itemId} FOR UPDATE`;
      const existing = await tx.itemImage.aggregate({ where: { itemId }, _count: true, _max: { sortOrder: true } });
      if (existing._count + stored.length > MAX_ITEM_IMAGES) throw new DomainError(`An item can have at most ${MAX_ITEM_IMAGES} photos.`, "invalid");
      const start = (existing._max.sortOrder ?? -1) + 1;
      const rows = [];
      for (const [index, image] of stored.entries()) {
        rows.push(await tx.itemImage.create({
          data: { spaceId, itemId, storageKey: image.storageKey, contentType: image.contentType, width: image.width, height: image.height, sortOrder: start + index },
          select: { id: true },
        }));
      }
      await recordAuditEvent({ client: tx, action: "item.images_added", spaceId, actorId: actor.userId, targetType: "Item", targetId: itemId, metadata: { count: rows.length } });
      return rows;
    });
  } catch (error) {
    await deleteObjects(stored.map((image) => image.storageKey)).catch(() => undefined);
    throw error;
  }
}

/** Delete the row (with its audit) and then the stored object. */
export async function removeItemImage(spaceId: string, imageId: string, actor: Actor) {
  const image = await prisma.$transaction(async (tx) => {
    const found = await tx.itemImage.findFirst({ where: { id: imageId, spaceId }, select: { id: true, itemId: true, storageKey: true } });
    if (!found) notFound("photo");
    await tx.itemImage.delete({ where: { id: found.id } });
    await recordAuditEvent({ client: tx, action: "item.image_removed", spaceId, actorId: actor.userId, targetType: "Item", targetId: found.itemId });
    return found;
  });
  await deleteObjects([image.storageKey]);
  return { itemId: image.itemId };
}

/** Save a new photo order; the list must name every photo of the item exactly once. */
export async function reorderItemImages(spaceId: string, itemId: string, orderedIds: string[], actor: Actor) {
  await prisma.$transaction(async (tx) => {
    const images = await tx.itemImage.findMany({ where: { itemId, spaceId }, select: { id: true } });
    const known = new Set(images.map((image) => image.id));
    if (orderedIds.length !== known.size || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !known.has(id))) {
      throw new DomainError("The photos changed. Reload the page and try again.", "conflict");
    }
    for (const [index, id] of orderedIds.entries()) await tx.itemImage.update({ where: { id }, data: { sortOrder: index } });
    await recordAuditEvent({ client: tx, action: "item.images_reordered", spaceId, actorId: actor.userId, targetType: "Item", targetId: itemId });
  });
}

/** The stored object of a photo, for an already-verified member of `spaceId`. */
export function imageForSpace(spaceId: string, imageId: string) {
  if (imageId.length > 64) return Promise.resolve(null);
  return prisma.itemImage.findFirst({ where: { id: imageId, spaceId }, select: { id: true, storageKey: true, contentType: true } });
}

/** Public catalogue photo: only for a public catalogue, a lendable item and nothing archived. */
export function publicImage(spaceSlug: string, imageId: string) {
  if (imageId.length > 64 || spaceSlug.length > 64) return Promise.resolve(null);
  return prisma.itemImage.findFirst({
    where: { id: imageId, space: { slug: spaceSlug, publicCatalogue: true, archivedAt: null }, item: { lendable: true, archivedAt: null } },
    select: { id: true, storageKey: true, contentType: true },
  });
}

export function itemImageUrl(spaceSlug: string, imageId: string) {
  return `/api/s/${encodeURIComponent(spaceSlug)}/images/${encodeURIComponent(imageId)}`;
}

export function publicItemImageUrl(spaceSlug: string, imageId: string) {
  return `/api/public/${encodeURIComponent(spaceSlug)}/images/${encodeURIComponent(imageId)}`;
}
