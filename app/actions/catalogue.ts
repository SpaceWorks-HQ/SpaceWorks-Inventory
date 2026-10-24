"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { notFound } from "@/lib/domainError";
import type { Bucket } from "@/lib/rateLimit";
import { canManageCatalogue, canManageLocations, canViewStock, type RoleHolder } from "@/lib/roles";
import type { SpaceContext } from "@/lib/permissions";
import { createAssets, updateAssetDetails } from "@/lib/catalogue/assets";
import { buildHierarchy, builderSchema, type BuilderInput } from "@/lib/catalogue/builder";
import { addItemImages, removeItemImage, reorderItemImages } from "@/lib/catalogue/images";
import { createItem, setItemArchived, updateItem } from "@/lib/catalogue/items";
import { createContainers, saveKit, setContainerArchived, setKitArchived } from "@/lib/catalogue/kits";
import { createLocation, setLocationArchived, updateLocation } from "@/lib/catalogue/locations";
import { assetBatchSchema, categorySchema, itemSchema, kitSchema, locationSchema, unitSchema, type ItemInput } from "@/lib/catalogue/schemas";
import { saveCategory, saveUnit } from "@/lib/catalogue/taxonomy";
import { qrSvg } from "@/lib/catalogue/views";

const id = z.string().trim().min(1).max(64);
const archiveSchema = z.object({ id, archived: z.boolean() });
const optionalId = z.string().trim().max(64).nullable().optional().transform((v) => v || null);

/**
 * Capability → validation → work → revalidate. Domain services re-parse and
 * audit inside their transaction, so they get the raw input (their schemas
 * don't accept their own transformed output).
 */
async function mutate<S extends z.ZodType, T>(
  slug: unknown, allowed: (m: RoleHolder) => boolean, schema: S, input: unknown,
  work: (ctx: SpaceContext, data: z.output<S>) => Promise<T>, paths: (data: z.output<S>, result: T) => string[], bucket?: Bucket,
): Promise<ActionResult<T>> {
  const { ctx, denied } = await spaceAction(slug, allowed, bucket);
  if (denied) return denied;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const result = await work(ctx, parsed.data);
    for (const path of paths(parsed.data, result)) revalidatePath(`/s/${ctx.space.slug}${path}`);
    return { ok: true, data: result };
  } catch (error) {
    return domainFailure(error);
  }
}

const actor = (ctx: SpaceContext) => ({ userId: ctx.user.id });

// ───────────── Items ─────────────

export async function createItemAction(slug: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(slug, canManageCatalogue, itemSchema, input, async (ctx) => {
    const item = await prisma.$transaction((tx) => createItem(tx, ctx.space.id, input as ItemInput, actor(ctx)));
    return { id: item.id };
  }, () => ["/items"]);
}

export async function updateItemAction(slug: string, itemId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(slug, canManageCatalogue, z.object({ itemId: id, item: itemSchema }), { itemId, item: input }, async (ctx, data) => {
    const item = await prisma.$transaction((tx) => updateItem(tx, ctx.space.id, data.itemId, input as ItemInput, actor(ctx)));
    return { id: item.id };
  }, (data) => ["/items", `/items/${data.itemId}`]);
}

export async function setItemArchivedAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return mutate(slug, canManageCatalogue, archiveSchema, input, async (ctx, data) => {
    await prisma.$transaction((tx) => setItemArchived(tx, ctx.space.id, data.id, data.archived, actor(ctx)));
    return null;
  }, (data) => ["/items", `/items/${data.id}`]);
}

export async function uploadItemImagesAction(slug: string, itemId: string, form: FormData): Promise<ActionResult<{ count: number }>> {
  const schema = z.object({ itemId: id, files: z.array(z.instanceof(File)).min(1, "Choose at least one photo.").max(6, "Add at most 6 photos.") });
  const files = form.getAll("photos").filter((value): value is File => value instanceof File && value.size > 0);
  return mutate(slug, canManageCatalogue, schema, { itemId, files }, async (ctx, data) => {
    const rows = await addItemImages(ctx.space.id, data.itemId, data.files, actor(ctx));
    return { count: rows.length };
  }, (data) => ["/items", `/items/${data.itemId}`], "upload");
}

export async function removeItemImageAction(slug: string, imageId: string): Promise<ActionResult<{ itemId: string }>> {
  return mutate(slug, canManageCatalogue, id, imageId, (ctx, data) => removeItemImage(ctx.space.id, data, actor(ctx)), (_data, result) => ["/items", `/items/${result.itemId}`]);
}

export async function reorderItemImagesAction(slug: string, itemId: string, imageIds: unknown): Promise<ActionResult<null>> {
  const schema = z.object({ itemId: id, imageIds: z.array(id).max(6) });
  return mutate(slug, canManageCatalogue, schema, { itemId, imageIds }, async (ctx, data) => {
    await reorderItemImages(ctx.space.id, data.itemId, data.imageIds, actor(ctx));
    return null;
  }, (data) => ["/items", `/items/${data.itemId}`]);
}

export async function quickAddCategoryAction(slug: string, input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  return mutate(slug, canManageCatalogue, categorySchema, input, async (ctx) => {
    const category = await prisma.$transaction((tx) => saveCategory(tx, ctx.space.id, null, input, actor(ctx)));
    return { id: category.id, name: category.name };
  }, () => ["/items"]);
}

export async function quickAddUnitAction(slug: string, input: unknown): Promise<ActionResult<{ id: string; name: string; symbol: string }>> {
  return mutate(slug, canManageCatalogue, unitSchema, input, async (ctx) => {
    const unit = await prisma.$transaction((tx) => saveUnit(tx, ctx.space.id, null, input, actor(ctx)));
    return { id: unit.id, name: unit.name, symbol: unit.symbol };
  }, () => ["/items"]);
}

// ───────────── Assets ─────────────

export async function createAssetsAction(slug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return mutate(slug, canManageCatalogue, assetBatchSchema, input, async (ctx) => {
    const created = await prisma.$transaction((tx) => createAssets(tx, ctx.space.id, input, actor(ctx)), { timeout: 60_000 });
    return { count: created.length };
  }, (data) => ["/items", `/items/${data.itemId}`, "/assets", "/stock"]);
}

const assetDetailsSchema = z.object({
  assetId: id,
  serialNumber: z.string().trim().max(80).optional().transform((v) => v || null),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
  warrantyUntil: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime())) ctx.addIssue({ code: "custom", message: "Enter a valid date." });
    return date;
  }),
  condition: z.enum(["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"]),
});

export async function updateAssetAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return mutate(slug, canManageCatalogue, assetDetailsSchema, input, async (ctx, { assetId, ...details }) => {
    await prisma.$transaction((tx) => updateAssetDetails(tx, ctx.space.id, assetId, details, actor(ctx)));
    return null;
  }, (data) => ["/assets", `/assets/${data.assetId}`]);
}

// ───────────── Locations ─────────────

export async function saveLocationAction(slug: string, locationId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(slug, canManageLocations, z.object({ locationId: optionalId, location: locationSchema }), { locationId, location: input }, async (ctx, data) => {
    const location = await prisma.$transaction((tx) => (data.locationId
      ? updateLocation(tx, ctx.space.id, data.locationId, input, actor(ctx))
      : createLocation(tx, ctx.space.id, input, actor(ctx))));
    return { id: location.id };
  }, () => ["/locations"]);
}

export async function setLocationArchivedAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return mutate(slug, canManageLocations, archiveSchema, input, async (ctx, data) => {
    await prisma.$transaction((tx) => setLocationArchived(tx, ctx.space.id, data.id, data.archived, actor(ctx)));
    return null;
  }, () => ["/locations"]);
}

export async function buildLocationsAction(slug: string, input: unknown): Promise<ActionResult<{ buildingCode: string; count: number }>> {
  return mutate(slug, canManageLocations, builderSchema, input, async (ctx) => {
    const built = await prisma.$transaction((tx) => buildHierarchy(tx, ctx.space.id, input as BuilderInput, actor(ctx)), { timeout: 60_000 });
    return { buildingCode: built.buildingCode, count: built.count };
  }, () => ["/locations"]);
}

// ───────────── Kits and containers ─────────────

export async function saveKitAction(slug: string, kitId: string | null, input: unknown): Promise<ActionResult<{ id: string }>> {
  return mutate(slug, canManageCatalogue, z.object({ kitId: optionalId, kit: kitSchema }), { kitId, kit: input }, async (ctx, data) => {
    const kit = await prisma.$transaction((tx) => saveKit(tx, ctx.space.id, data.kitId, input, actor(ctx)));
    return { id: kit.id };
  }, () => ["/kits"]);
}

export async function setKitArchivedAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return mutate(slug, canManageCatalogue, archiveSchema, input, async (ctx, data) => {
    await prisma.$transaction((tx) => setKitArchived(tx, ctx.space.id, data.id, data.archived, actor(ctx)));
    return null;
  }, () => ["/kits"]);
}

const containersSchema = z.object({
  count: z.number().int().min(1, "Create at least one container.").max(100, "Create at most 100 containers at a time."),
  name: z.string().trim().max(60).optional().transform((v) => v || null),
});

export async function createContainersAction(slug: string, input: unknown): Promise<ActionResult<{ count: number }>> {
  return mutate(slug, canManageCatalogue, containersSchema, input, async (ctx, data) => {
    const created = await prisma.$transaction((tx) => createContainers(tx, ctx.space.id, data, actor(ctx)));
    return { count: created.length };
  }, () => ["/kits"]);
}

export async function setContainerArchivedAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return mutate(slug, canManageCatalogue, archiveSchema, input, async (ctx, data) => {
    await prisma.$transaction((tx) => setContainerArchived(tx, ctx.space.id, data.id, data.archived, actor(ctx)));
    return null;
  }, () => ["/kits"]);
}

// ───────────── QR codes ─────────────

const qrSchema = z.object({ kind: z.enum(["location", "kit", "container"]), id });

/** The QR of a location, kit or container as SVG, for the on-demand QR dialog. */
export async function qrCodeAction(slug: string, input: unknown): Promise<ActionResult<{ svg: string }>> {
  return mutate(slug, canViewStock, qrSchema, input, async (ctx, { kind, id: recordId }) => {
    const where = { id: recordId, spaceId: ctx.space.id };
    const select = { qrCode: true } as const;
    const row = kind === "location" ? await prisma.location.findFirst({ where, select })
      : kind === "kit" ? await prisma.kit.findFirst({ where, select })
        : await prisma.container.findFirst({ where, select });
    if (!row) notFound(kind);
    return { svg: await qrSvg(row.qrCode) };
  }, () => [], "scan");
}
