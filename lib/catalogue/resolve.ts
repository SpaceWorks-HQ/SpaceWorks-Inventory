import "server-only";

import { prisma, type DbClient } from "@/lib/db";
import { extractQrCode, qrKindOf } from "./qr";

export type Resolved =
  | { kind: "item"; id: string; code: string; label: string; itemId: string; tracking: "QUANTITY" | "SERIALIZED" }
  | { kind: "asset"; id: string; code: string; label: string; itemId: string; status: string; locationId: string | null }
  | { kind: "location"; id: string; code: string; label: string }
  | { kind: "kit"; id: string; code: string; label: string }
  | { kind: "container"; id: string; code: string; label: string };

/**
 * Resolve a scanned QR value inside one space. Codes from another space
 * resolve to null, exactly like unknown codes, so a scan never reveals
 * another space's inventory.
 */
export async function resolveScan(spaceId: string, scanned: string, client: DbClient = prisma): Promise<Resolved | null> {
  const code = extractQrCode(scanned);
  if (!code) return null;
  switch (qrKindOf(code)) {
    case "item": {
      const item = await client.item.findFirst({ where: { qrCode: code, spaceId }, select: { id: true, name: true, sku: true, tracking: true } });
      return item ? { kind: "item", id: item.id, code, label: `${item.name} (${item.sku})`, itemId: item.id, tracking: item.tracking } : null;
    }
    case "asset": {
      const asset = await client.asset.findFirst({ where: { qrCode: code, spaceId }, select: { id: true, assetTag: true, itemId: true, status: true, locationId: true, item: { select: { name: true } } } });
      return asset ? { kind: "asset", id: asset.id, code, label: `${asset.item.name} · ${asset.assetTag}`, itemId: asset.itemId, status: asset.status, locationId: asset.locationId } : null;
    }
    case "location": {
      const location = await client.location.findFirst({ where: { qrCode: code, spaceId }, select: { id: true, name: true, code: true } });
      return location ? { kind: "location", id: location.id, code, label: `${location.name} (${location.code})` } : null;
    }
    case "kit": {
      const kit = await client.kit.findFirst({ where: { qrCode: code, spaceId }, select: { id: true, name: true } });
      return kit ? { kind: "kit", id: kit.id, code, label: kit.name } : null;
    }
    case "container": {
      const container = await client.container.findFirst({ where: { qrCode: code, spaceId }, select: { id: true, code: true, name: true } });
      return container ? { kind: "container", id: container.id, code, label: container.name ? `${container.code} · ${container.name}` : container.code } : null;
    }
    default:
      return null;
  }
}
