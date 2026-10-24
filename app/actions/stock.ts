"use server";

import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { revalidatePath } from "@/lib/frontend/cache";
import { domainFailure, spaceAction } from "@/lib/actionContext";
import { validationError, type ActionResult } from "@/lib/actionResult";
import { recordAuditEvent, type AuditMetadata } from "@/lib/audit";
import { notFound } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { canAdjustStock, type RoleHolder } from "@/lib/roles";
import type { SpaceContext } from "@/lib/permissions";
import { adjustStock, changeAssetState, moveAsset, moveStock, quarantineStock, receiveStock, resolveQuarantine } from "@/lib/inventory/availability";

const id = z.string().trim().min(1).max(64);
const quantity = z.number({ message: "Enter a quantity." }).int("Use whole numbers.").min(1, "Enter a quantity above zero.").max(1_000_000);
const note = z.string().trim().max(500).optional().transform((v) => v || null);
const REASONS = ["RECEIVED", "FOUND", "CORRECTION", "CONSUMED", "LOST", "DAMAGED", "EXPIRED", "STOLEN", "DONATED", "RETURNED_TO_SUPPLIER", "OTHER"] as const;

const receiveSchema = z.object({ itemId: id, locationId: id, quantity, unitCostMinor: z.number().int().min(0).max(100_000_000).nullable().optional(), note });
const adjustSchema = z.object({
  itemId: id, locationId: id, reason: z.enum(REASONS, { message: "Choose a reason." }), note,
  delta: z.number({ message: "Enter a change." }).int("Use whole numbers.").min(-1_000_000).max(1_000_000).refine((v) => v !== 0, "Enter a change other than zero."),
});
const moveSchema = z.object({ itemId: id, fromLocationId: id, toLocationId: id, quantity, note });
const quarantineSchema = z.object({ itemId: id, locationId: id, quantity, note });
const resolveSchema = z.object({ itemId: id, locationId: id, quantity, outcome: z.enum(["repair", "scrap"]), note });
const assetStateSchema = z.object({ assetId: id, action: z.enum(["maintenance", "repair", "retire", "found"]), locationId: id.optional(), note });
const moveAssetSchema = z.object({ assetId: id, toLocationId: id, note });

type Ctx = SpaceContext;

/** Capability → validation → availability module in one transaction with its audit → revalidate. */
async function stockChange<S extends z.ZodType>(slug: unknown, schema: S, input: unknown, work: (tx: Tx, ctx: Ctx, data: z.output<S>) => Promise<{ paths: string[] }>, allowed: (m: RoleHolder) => boolean = canAdjustStock): Promise<ActionResult<null>> {
  const { ctx, denied } = await spaceAction(slug, allowed);
  if (denied) return denied;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  try {
    const { paths } = await prisma.$transaction((tx) => work(tx, ctx, parsed.data));
    for (const path of ["/stock", "/stock/movements", "/items", ...paths]) revalidatePath(`/s/${ctx.space.slug}${path}`);
    return { ok: true, data: null };
  } catch (error) {
    return domainFailure(error);
  }
}

/** The availability module trusts its caller on tenancy: check the item and locations belong to this space. */
async function assertTargets(tx: Tx, spaceId: string, itemId: string | null, locationIds: string[]) {
  if (itemId && !(await tx.item.findFirst({ where: { id: itemId, spaceId }, select: { id: true } }))) notFound("item");
  const unique = [...new Set(locationIds)];
  if (unique.length && (await tx.location.count({ where: { id: { in: unique }, spaceId, archivedAt: null } })) !== unique.length) notFound("location");
}

function audit(tx: Tx, ctx: Ctx, action: string, targetType: string, targetId: string, metadata: AuditMetadata) {
  return recordAuditEvent({ client: tx, action, spaceId: ctx.space.id, actorId: ctx.user.id, targetType, targetId, metadata });
}

const actor = (ctx: Ctx) => ({ userId: ctx.user.id });

export async function receiveStockAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, receiveSchema, input, async (tx, ctx, data) => {
    await assertTargets(tx, ctx.space.id, data.itemId, [data.locationId]);
    await receiveStock(tx, { spaceId: ctx.space.id, itemId: data.itemId, locationId: data.locationId, quantity: data.quantity, unitCostMinor: data.unitCostMinor ?? null }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, "stock.received", "Item", data.itemId, { locationId: data.locationId, quantity: data.quantity });
    await emitEvent(tx, { spaceId: ctx.space.id, type: "stock.adjusted", data: { itemId: data.itemId, locationId: data.locationId, quantity: data.quantity, reason: "RECEIVED" } });
    return { paths: [`/items/${data.itemId}`] };
  });
}

export async function adjustStockAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, adjustSchema, input, async (tx, ctx, data) => {
    await assertTargets(tx, ctx.space.id, data.itemId, [data.locationId]);
    await adjustStock(tx, { spaceId: ctx.space.id, itemId: data.itemId, locationId: data.locationId, delta: data.delta, reason: data.reason }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, "stock.adjusted", "Item", data.itemId, { locationId: data.locationId, delta: data.delta, reason: data.reason });
    await emitEvent(tx, { spaceId: ctx.space.id, type: "stock.adjusted", data: { itemId: data.itemId, locationId: data.locationId, quantity: data.delta, reason: data.reason } });
    return { paths: [`/items/${data.itemId}`] };
  });
}

export async function moveStockAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, moveSchema, input, async (tx, ctx, data) => {
    await assertTargets(tx, ctx.space.id, data.itemId, [data.fromLocationId, data.toLocationId]);
    await moveStock(tx, { spaceId: ctx.space.id, itemId: data.itemId, fromLocationId: data.fromLocationId, toLocationId: data.toLocationId, quantity: data.quantity }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, "stock.moved", "Item", data.itemId, { from: data.fromLocationId, to: data.toLocationId, quantity: data.quantity });
    return { paths: [`/items/${data.itemId}`] };
  });
}

export async function quarantineStockAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, quarantineSchema, input, async (tx, ctx, data) => {
    await assertTargets(tx, ctx.space.id, data.itemId, [data.locationId]);
    await quarantineStock(tx, { spaceId: ctx.space.id, itemId: data.itemId, locationId: data.locationId, quantity: data.quantity }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, "stock.quarantined", "Item", data.itemId, { locationId: data.locationId, quantity: data.quantity });
    return { paths: [`/items/${data.itemId}`] };
  });
}

export async function resolveQuarantineAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, resolveSchema, input, async (tx, ctx, data) => {
    await assertTargets(tx, ctx.space.id, data.itemId, [data.locationId]);
    await resolveQuarantine(tx, { spaceId: ctx.space.id, itemId: data.itemId, locationId: data.locationId, quantity: data.quantity, outcome: data.outcome }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, data.outcome === "repair" ? "stock.repaired" : "stock.scrapped", "Item", data.itemId, { locationId: data.locationId, quantity: data.quantity });
    return { paths: [`/items/${data.itemId}`] };
  });
}

async function assetInSpace(tx: Tx, spaceId: string, assetId: string) {
  const asset = await tx.asset.findFirst({ where: { id: assetId, spaceId }, select: { id: true, itemId: true } });
  if (!asset) notFound("asset");
  return asset;
}

export async function changeAssetStateAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, assetStateSchema, input, async (tx, ctx, data) => {
    const asset = await assetInSpace(tx, ctx.space.id, data.assetId);
    if (data.locationId) await assertTargets(tx, ctx.space.id, null, [data.locationId]);
    await changeAssetState(tx, { spaceId: ctx.space.id, assetId: data.assetId, action: data.action, locationId: data.locationId }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, `asset.${data.action === "maintenance" ? "sent_to_repair" : data.action === "repair" ? "repaired" : data.action === "retire" ? "retired" : "found"}`, "Asset", data.assetId, { locationId: data.locationId ?? null });
    return { paths: ["/assets", `/assets/${data.assetId}`, `/items/${asset.itemId}`] };
  });
}

export async function moveAssetAction(slug: string, input: unknown): Promise<ActionResult<null>> {
  return stockChange(slug, moveAssetSchema, input, async (tx, ctx, data) => {
    const asset = await assetInSpace(tx, ctx.space.id, data.assetId);
    await assertTargets(tx, ctx.space.id, null, [data.toLocationId]);
    await moveAsset(tx, { spaceId: ctx.space.id, assetId: data.assetId, toLocationId: data.toLocationId }, actor(ctx), { refType: "Adjustment", note: data.note });
    await audit(tx, ctx, "asset.moved", "Asset", data.assetId, { to: data.toLocationId });
    return { paths: ["/assets", `/assets/${data.assetId}`, `/items/${asset.itemId}`] };
  });
}
