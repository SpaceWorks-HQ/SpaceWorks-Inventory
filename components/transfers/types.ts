import type { TrackingMode, TransferAssetState } from "@prisma/client";

/** Plain data the transfer step forms receive from the page. */
export type TransferLineView = {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  tracking: TrackingMode;
  itemCode: string;
  unit: string | null;
  requested: number;
  approved: number;
  dispatched: number;
  received: number;
  damaged: number;
  missing: number;
  returning: number;
  returned: number;
  inTransit: number;
  comingBack: number;
  assets: { id: string; tag: string; code: string; state: TransferAssetState }[];
};

export type PickableAsset = { id: string; itemId: string; tag: string; code: string; itemName: string };

/** code → label for the scanner, and which line a scanned code counts towards. */
export function scanIndex(entries: Array<{ code: string; label: string; lineId: string }>) {
  const known: Record<string, string> = {};
  const lineOf: Record<string, string> = {};
  for (const entry of entries) {
    known[entry.code] = entry.label;
    lineOf[entry.code] = entry.lineId;
  }
  return { known, lineOf };
}
