import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError, notFound } from "@/lib/domainError";
import { addAssetToStock } from "@/lib/inventory/availability";
import { newQrCode } from "./qr";
import { assetTag } from "./references";
import { assetBatchSchema } from "./schemas";

type Actor = { userId: string | null; apiTokenId?: string | null };

/**
 * Register physical units of a SERIALIZED item: one row, tag and QR code
 * each, added to stock at the chosen location. With serial numbers given,
 * one asset per serial; otherwise `count` untagged-serial assets.
 */
export async function createAssets(tx: Tx, spaceId: string, raw: unknown, actor: Actor, ref: { refType?: string; refId?: string } = {}) {
  const input = assetBatchSchema.parse(raw);
  const [item, location, space] = await Promise.all([
    tx.item.findFirst({ where: { id: input.itemId, spaceId, archivedAt: null }, select: { id: true, tracking: true, unitCostMinor: true } }),
    tx.location.findFirst({ where: { id: input.locationId, spaceId, archivedAt: null }, select: { id: true } }),
    tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { tagPrefix: true } }),
  ]);
  if (!item) notFound("item");
  if (!location) notFound("location");
  if (item.tracking !== "SERIALIZED") throw new DomainError("Only serialized items have individual assets. Receive stock for quantity items instead.", "invalid");
  const serials = input.serialNumbers.filter(Boolean);
  if (new Set(serials).size !== serials.length) throw new DomainError("Each serial number can only appear once.", "invalid");
  const total = serials.length > 0 ? serials.length : input.count;
  const created = [];
  for (let index = 0; index < total; index += 1) {
    const number = await nextSpaceSequence(tx, spaceId, "asset");
    const asset = await tx.asset.create({
      data: {
        spaceId,
        itemId: item.id,
        assetTag: assetTag(space.tagPrefix, number),
        qrCode: newQrCode("asset"),
        serialNumber: serials[index] ?? null,
        locationId: location.id,
        status: "AVAILABLE",
        condition: input.condition,
        purchaseCostMinor: input.purchaseCostMinor ?? item.unitCostMinor,
        purchasedAt: input.purchasedAt ?? null,
        warrantyUntil: input.warrantyUntil ?? null,
      },
    });
    await addAssetToStock(tx, { id: asset.id, spaceId, itemId: item.id, locationId: location.id, purchaseCostMinor: asset.purchaseCostMinor }, actor, { refType: ref.refType ?? "Asset", refId: ref.refId ?? asset.id });
    created.push(asset);
  }
  await recordAuditEvent({ client: tx, action: "asset.created", spaceId, actorId: actor.userId, actorApiTokenId: actor.apiTokenId ?? null, targetType: "Item", targetId: item.id, metadata: { count: created.length } });
  return created;
}

export async function updateAssetDetails(tx: Tx, spaceId: string, assetId: string, input: { serialNumber: string | null; notes: string | null; warrantyUntil: Date | null; condition: "NEW" | "GOOD" | "FAIR" | "POOR" | "DAMAGED" }, actor: Actor) {
  const asset = await tx.asset.findFirst({ where: { id: assetId, spaceId }, select: { id: true, status: true } });
  if (!asset) notFound("asset");
  if (asset.status === "ON_LOAN" || asset.status === "IN_TRANSIT") throw new DomainError("Edit the asset once it is back.", "conflict");
  await tx.asset.update({ where: { id: assetId }, data: input });
  await recordAuditEvent({ client: tx, action: "asset.updated", spaceId, actorId: actor.userId, targetType: "Asset", targetId: assetId });
}
