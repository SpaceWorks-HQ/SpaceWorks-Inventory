type Level = { itemId: string; onHand: number; reserved: number; quarantined: number };

/** Pull transfers reserve on one shelf; totals spread over shelves cannot be offered. */
export function singleShelfAvailability(levels: readonly Level[]): Map<string, number> {
  const available = new Map<string, number>();
  for (const level of levels) {
    available.set(level.itemId, Math.max(available.get(level.itemId) ?? 0, level.onHand - level.reserved - level.quarantined));
  }
  return available;
}

/** Any physical quantity line needs its item label at receipt, including a return to the sender. */
export function receiptLabelsMissing(lines: readonly { tracking: string; itemCode: string; units: number }[], codes: readonly string[]): boolean {
  return lines.some((line) => line.tracking === "QUANTITY" && line.units > 0 && !codes.includes(line.itemCode));
}
