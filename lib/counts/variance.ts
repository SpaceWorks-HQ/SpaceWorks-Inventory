export type CountLineFacts = {
  tracking: "QUANTITY" | "SERIALIZED";
  expectedQty: number;
  countedQty: number | null;
  onHand: number;
  availableAssets: number;
  scannedAssets: number;
  posted?: boolean;
};

/** Posted lines use their snapshot, falling back to scans for legacy serialised counts. */
export function lineVariance(line: CountLineFacts): { expected: number; variance: number; counted: boolean } {
  const serialized = line.tracking === "SERIALIZED";
  const expected = serialized && !line.posted ? line.availableAssets : line.expectedQty;
  const counted = line.countedQty !== null || (serialized && line.scannedAssets > 0);
  const found = serialized && !line.posted ? line.scannedAssets : line.countedQty ?? (serialized ? line.scannedAssets : 0);
  return { expected, variance: counted ? found - expected : 0, counted };
}
