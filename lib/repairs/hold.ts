import "server-only";

import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { changeAssetState, quarantineStock, resolveQuarantine, type Actor, type MovementRef } from "@/lib/inventory/availability";

/**
 * Stock a repair keeps out of use. Only lib/inventory/availability changes
 * the buckets: a serialized asset goes to MAINTENANCE, quantity stock to the
 * quarantined bucket. A unit that is already on the repair shelf (returned
 * damaged) is adopted as it is, and goes back to its incident if the repair
 * is cancelled.
 */

export type Hold = { heldQuantity: number; heldLocationId: string | null; holdAdopted: boolean };

const NONE: Hold = { heldQuantity: 0, heldLocationId: null, holdAdopted: false };

export async function holdForRepair(tx: Tx, input: { spaceId: string; itemId: string; assetId: string | null; quantity: number; locationId: string | null }, actor: Actor, ref: MovementRef): Promise<Hold> {
  if (input.assetId) {
    const asset = await tx.asset.findFirst({ where: { id: input.assetId, spaceId: input.spaceId, itemId: input.itemId }, select: { status: true, locationId: true } });
    if (!asset) throw new DomainError("That asset wasn't found.", "not_found");
    if (asset.status === "MAINTENANCE") return { heldQuantity: 1, heldLocationId: asset.locationId, holdAdopted: true };
    if (asset.status !== "AVAILABLE") return NONE;
    await changeAssetState(tx, { spaceId: input.spaceId, assetId: input.assetId, action: "maintenance" }, actor, ref);
    return { heldQuantity: 1, heldLocationId: asset.locationId, holdAdopted: false };
  }
  if (input.quantity <= 0 || !input.locationId) return NONE;
  await quarantineStock(tx, { spaceId: input.spaceId, itemId: input.itemId, locationId: input.locationId, quantity: input.quantity }, actor, ref);
  return { heldQuantity: input.quantity, heldLocationId: input.locationId, holdAdopted: false };
}

/** Units of a damaged-item incident that are already on the repair shelf where they came back. */
export async function adoptIncidentHold(tx: Tx, incident: { assetId: string | null; quantity: number; line: { itemId: string; locationId: string | null } }): Promise<Hold> {
  if (incident.assetId) {
    const asset = await tx.asset.findUnique({ where: { id: incident.assetId }, select: { status: true, locationId: true } });
    return asset?.status === "MAINTENANCE" ? { heldQuantity: 1, heldLocationId: asset.locationId, holdAdopted: true } : NONE;
  }
  if (!incident.line.locationId) return NONE;
  const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: incident.line.itemId, locationId: incident.line.locationId } }, select: { quarantined: true } });
  const quantity = Math.min(incident.quantity, level?.quarantined ?? 0);
  return quantity > 0 ? { heldQuantity: quantity, heldLocationId: incident.line.locationId, holdAdopted: true } : NONE;
}

/**
 * Put held stock back in use (fixed or cancelled) or write it off
 * (scrapped). A cancelled repair leaves an adopted hold for its incident.
 * Anything already released elsewhere (on the stock page) is skipped.
 */
export async function releaseRepairHold(tx: Tx, issue: { spaceId: string; itemId: string; assetId: string | null } & Hold, outcome: "fixed" | "scrapped" | "cancelled", actor: Actor, ref: MovementRef) {
  if (issue.heldQuantity <= 0) return;
  if (outcome === "cancelled" && issue.holdAdopted) return;
  if (issue.assetId) {
    const asset = await tx.asset.findUnique({ where: { id: issue.assetId }, select: { status: true, locationId: true } });
    if (asset?.status !== "MAINTENANCE") return;
    if (outcome === "scrapped") await changeAssetState(tx, { spaceId: issue.spaceId, assetId: issue.assetId, action: "retire" }, actor, ref);
    else await changeAssetState(tx, { spaceId: issue.spaceId, assetId: issue.assetId, action: "repair", locationId: asset.locationId ?? undefined }, actor, ref);
    return;
  }
  if (!issue.heldLocationId) return;
  const level = await tx.stockLevel.findUnique({ where: { itemId_locationId: { itemId: issue.itemId, locationId: issue.heldLocationId } }, select: { quarantined: true } });
  const quantity = Math.min(issue.heldQuantity, level?.quarantined ?? 0);
  if (quantity <= 0) return;
  await resolveQuarantine(tx, { spaceId: issue.spaceId, itemId: issue.itemId, locationId: issue.heldLocationId, quantity, outcome: outcome === "scrapped" ? "scrap" : "repair" }, actor, ref);
}
