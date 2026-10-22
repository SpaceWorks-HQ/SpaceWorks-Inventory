import "server-only";

import type { AssetCondition, AssetStatus } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { StockError, type Actor, type MovementRef } from "./errors";
import { applyLevelChange, availableOf, lockItems, lockLevels, recordLedgerOnly } from "./levels";
import { checkLowStock } from "./lowStock";

export type LockedAsset = { id: string; spaceId: string; itemId: string; locationId: string | null; status: AssetStatus; assetTag: string; condition: AssetCondition };

/** Lock assets in id order (after Item and StockLevel rows). */
export async function lockAssets(tx: Tx, assetIds: string[]): Promise<Map<string, LockedAsset>> {
  const ids = [...new Set(assetIds)].sort();
  const rows = ids.length
    ? await tx.$queryRaw<LockedAsset[]>`
        SELECT "id", "spaceId", "itemId", "locationId", "status"::text AS "status", "assetTag", "condition"::text AS "condition"
        FROM "Asset" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`
    : [];
  return new Map(rows.map((row) => [row.id, row]));
}

/** Register a new physical unit at a location: one more on hand. */
export async function addAssetToStock(tx: Tx, asset: { id: string; spaceId: string; itemId: string; locationId: string; purchaseCostMinor?: number | null }, actor: Actor, ref: MovementRef = {}) {
  await lockItems(tx, [asset.itemId]);
  const level = (await lockLevels(tx, asset.spaceId, [asset])).get(`${asset.itemId}:${asset.locationId}`)!;
  await applyLevelChange(tx, level, { onHand: 1, type: ref.refType === "Import" ? "IMPORT" : "RECEIPT", reason: "RECEIVED", assetId: asset.id, unitCostMinor: asset.purchaseCostMinor ?? null }, actor, ref);
  await checkLowStock(tx, [asset.itemId]);
}

/**
 * Take one AVAILABLE asset out of its location (loan issue, transfer
 * dispatch, self-checkout). Release the line's holds first: the free count
 * at the asset's location must cover it.
 */
export async function takeAsset(tx: Tx, input: { spaceId: string; assetId: string; itemId: string; to: "ON_LOAN" | "IN_TRANSIT"; type: "ISSUE" | "TRANSFER_OUT" }, actor: Actor, ref: MovementRef = {}) {
  await lockItems(tx, [input.itemId]);
  const asset = (await lockAssets(tx, [input.assetId])).get(input.assetId);
  if (!asset || asset.spaceId !== input.spaceId || asset.itemId !== input.itemId) throw new StockError("That QR code isn't for this item.", "asset_unavailable");
  if (asset.status !== "AVAILABLE" || !asset.locationId) throw new StockError(`${asset.assetTag} isn't available (it is ${asset.status.toLowerCase().replace("_", " ")}).`, "asset_unavailable");
  const level = (await lockLevels(tx, input.spaceId, [{ itemId: input.itemId, locationId: asset.locationId }])).get(`${input.itemId}:${asset.locationId}`)!;
  if (availableOf(level) < 1) throw new StockError(`${asset.assetTag} is held for another request.`, "asset_unavailable");
  await applyLevelChange(tx, level, { onHand: -1, type: input.type, assetId: asset.id }, actor, ref);
  await tx.asset.update({ where: { id: asset.id }, data: { status: input.to } });
  await checkLowStock(tx, [input.itemId]);
  return asset;
}

export type AssetOutcome = "returned" | "damaged" | "missing";

/**
 * An asset comes back from a loan or transfer (or is declared missing). It
 * may land in another space when a transfer between spaces is received.
 */
export async function bringBackAsset(tx: Tx, input: { assetId: string; spaceId: string; itemId: string; locationId: string; outcome: AssetOutcome; type: "RETURN" | "TRANSFER_IN" | "TRANSFER_RETURN"; expect: "ON_LOAN" | "IN_TRANSIT" }, actor: Actor, ref: MovementRef = {}) {
  await lockItems(tx, [input.itemId]);
  const asset = (await lockAssets(tx, [input.assetId])).get(input.assetId);
  if (!asset || asset.status !== input.expect) throw new StockError("That asset isn't out on this loan or transfer.", "asset_unavailable");
  if (input.outcome === "missing") {
    await tx.asset.update({ where: { id: asset.id }, data: { status: "LOST", locationId: null } });
    await recordLedgerOnly(tx, { spaceId: asset.spaceId, itemId: asset.itemId, assetId: asset.id, type: input.type === "RETURN" ? "LOSS" : "TRANSFER_LOSS", reason: "LOST" }, actor, ref);
    return asset;
  }
  const damaged = input.outcome === "damaged";
  const level = (await lockLevels(tx, input.spaceId, [{ itemId: input.itemId, locationId: input.locationId }])).get(`${input.itemId}:${input.locationId}`)!;
  await applyLevelChange(tx, level, { onHand: 1, quarantined: damaged ? 1 : 0, type: input.type, assetId: asset.id }, actor, ref);
  await tx.asset.update({
    where: { id: asset.id },
    data: { spaceId: input.spaceId, itemId: input.itemId, locationId: input.locationId, status: damaged ? "MAINTENANCE" : "AVAILABLE", ...(damaged ? { condition: "DAMAGED" } : {}) },
  });
  await checkLowStock(tx, [input.itemId]);
  return asset;
}

/** Move an idle asset to another shelf in the same space. */
export async function moveAsset(tx: Tx, input: { spaceId: string; assetId: string; toLocationId: string }, actor: Actor, ref: MovementRef = {}) {
  const current = await tx.asset.findUnique({ where: { id: input.assetId }, select: { itemId: true } });
  if (!current) throw new StockError("That asset no longer exists.", "asset_unavailable");
  await lockItems(tx, [current.itemId]);
  const asset = (await lockAssets(tx, [input.assetId])).get(input.assetId)!;
  if (asset.spaceId !== input.spaceId || !asset.locationId) throw new StockError("That asset isn't on a shelf in this space.", "asset_unavailable");
  if (asset.locationId === input.toLocationId) return asset;
  if (asset.status !== "AVAILABLE" && asset.status !== "MAINTENANCE") throw new StockError(`${asset.assetTag} can't move while it is ${asset.status.toLowerCase().replace("_", " ")}.`, "asset_unavailable");
  const held = asset.status === "MAINTENANCE" ? 1 : 0;
  const levels = await lockLevels(tx, input.spaceId, [{ itemId: asset.itemId, locationId: asset.locationId }, { itemId: asset.itemId, locationId: input.toLocationId }]);
  const from = levels.get(`${asset.itemId}:${asset.locationId}`)!;
  if (!held && availableOf(from) < 1) throw new StockError(`${asset.assetTag} is held for a request; release it first.`, "asset_unavailable");
  await applyLevelChange(tx, from, { onHand: -1, quarantined: -held, type: "MOVE", assetId: asset.id }, actor, ref);
  await applyLevelChange(tx, levels.get(`${asset.itemId}:${input.toLocationId}`)!, { onHand: 1, quarantined: held, type: "MOVE", assetId: asset.id }, actor, ref);
  await tx.asset.update({ where: { id: asset.id }, data: { locationId: input.toLocationId } });
  return asset;
}

/** Repair shelf and end of life for one asset. */
export async function changeAssetState(tx: Tx, input: { spaceId: string; assetId: string; action: "maintenance" | "repair" | "retire" | "found"; locationId?: string }, actor: Actor, ref: MovementRef = {}) {
  const current = await tx.asset.findUnique({ where: { id: input.assetId }, select: { itemId: true } });
  if (!current) throw new StockError("That asset no longer exists.", "asset_unavailable");
  await lockItems(tx, [current.itemId]);
  const asset = (await lockAssets(tx, [input.assetId])).get(input.assetId)!;
  if (asset.spaceId !== input.spaceId) throw new StockError("That asset belongs to another space.", "asset_unavailable");
  const locationId = asset.locationId ?? input.locationId;
  const levelFor = async (id: string) => (await lockLevels(tx, input.spaceId, [{ itemId: asset.itemId, locationId: id }])).get(`${asset.itemId}:${id}`)!;
  if (input.action === "maintenance") {
    if (asset.status !== "AVAILABLE" || !locationId) throw new StockError("Only an available asset on a shelf can go for repair.", "asset_unavailable");
    const level = await levelFor(locationId);
    if (availableOf(level) < 1) throw new StockError(`${asset.assetTag} is held for a request; release it first.`, "asset_unavailable");
    await applyLevelChange(tx, level, { quarantined: 1, type: "DAMAGE", reason: "DAMAGED", assetId: asset.id }, actor, ref);
    await tx.asset.update({ where: { id: asset.id }, data: { status: "MAINTENANCE" } });
  } else if (input.action === "repair") {
    if (asset.status !== "MAINTENANCE" || !locationId) throw new StockError("Only an asset under repair can be marked repaired.", "asset_unavailable");
    await applyLevelChange(tx, await levelFor(locationId), { quarantined: -1, type: "REPAIR", assetId: asset.id }, actor, ref);
    await tx.asset.update({ where: { id: asset.id }, data: { status: "AVAILABLE", condition: "GOOD" } });
  } else if (input.action === "retire") {
    if (asset.status === "AVAILABLE" || asset.status === "MAINTENANCE") {
      const level = await levelFor(locationId!);
      if (asset.status === "AVAILABLE" && availableOf(level) < 1) throw new StockError(`${asset.assetTag} is held for a request; release it first.`, "asset_unavailable");
      await applyLevelChange(tx, level, { onHand: -1, quarantined: asset.status === "MAINTENANCE" ? -1 : 0, type: "WRITE_OFF", reason: "OTHER", assetId: asset.id }, actor, ref);
    } else if (asset.status !== "LOST") {
      throw new StockError(`${asset.assetTag} can't be retired while it is ${asset.status.toLowerCase().replace("_", " ")}.`, "asset_unavailable");
    }
    await tx.asset.update({ where: { id: asset.id }, data: { status: "RETIRED", locationId: null } });
  } else {
    if (asset.status !== "LOST" || !input.locationId) throw new StockError("Only a lost asset can be marked found, on a shelf.", "asset_unavailable");
    await applyLevelChange(tx, await levelFor(input.locationId), { onHand: 1, type: "ADJUSTMENT", reason: "FOUND", assetId: asset.id }, actor, ref);
    await tx.asset.update({ where: { id: asset.id }, data: { status: "AVAILABLE", locationId: input.locationId } });
  }
  await checkLowStock(tx, [asset.itemId]);
  return asset;
}
