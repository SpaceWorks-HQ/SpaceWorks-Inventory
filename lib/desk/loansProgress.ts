/**
 * What still needs scanning at a loan handover (pure, client-safe). It
 * mirrors the workflow's rules so the desk sees progress as it scans; the
 * workflow re-checks everything when the step is saved.
 */

export type HandoverLine = { id: string; itemId: string; name: string; tracking: "QUANTITY" | "SERIALIZED"; itemCode: string; units: number; assetCode?: string | null };
export type ScanCatalog = { assets: Record<string, { itemId: string }>; containerCodes: readonly string[] };
export type LineProgress = { lineId: string; name: string; need: number; have: number; hint: string };

/**
 * Issue: each serialized unit needs its own asset tag; a quantity line needs
 * its item label, or the scan of the container it is packed in.
 */
export function issueProgress(lines: readonly HandoverLine[], scanned: readonly string[], catalog: ScanCatalog): { lines: LineProgress[]; containerScanned: boolean; done: boolean } {
  const codes = new Set(scanned);
  const containerScanned = catalog.containerCodes.some((code) => codes.has(code));
  const result = lines.filter((line) => line.units > 0).map((line) => {
    if (line.tracking === "SERIALIZED") {
      const have = [...codes].filter((code) => catalog.assets[code]?.itemId === line.itemId).length;
      return { lineId: line.id, name: line.name, need: line.units, have, hint: have > line.units ? `Remove ${have - line.units} extra ${have - line.units === 1 ? "tag" : "tags"}` : have === line.units ? "All asset tags scanned" : `Scan ${line.units - have} more asset ${line.units - have === 1 ? "tag" : "tags"}` };
    }
    const have = codes.has(line.itemCode) || containerScanned ? 1 : 0;
    return { lineId: line.id, name: line.name, need: 1, have, hint: have ? "Label scanned" : "Scan the item label or the container" };
  });
  return { lines: result, containerScanned, done: result.every((line) => line.have === line.need) };
}

export type ReturnChange = { lineId: string; returned: number; damaged: number; lost: number };

/** Keep every outcome within the latest outstanding balance, including after a refresh. */
export function clampReturnChange<T extends ReturnChange>(change: T, outstanding: number): T {
  let remaining = Math.max(0, outstanding);
  const take = (value: number) => {
    const units = Number.isSafeInteger(value) ? Math.min(remaining, Math.max(0, value)) : 0;
    remaining -= units;
    return units;
  };
  return { ...change, returned: take(change.returned), damaged: take(change.damaged), lost: take(change.lost) };
}

/**
 * Return: a returned or damaged serialized unit needs its asset tag; a
 * quantity line coming back needs its label (or the loan's container).
 * A loan packed in a container needs that container scanned.
 */
export function returnProgress(lines: readonly HandoverLine[], changes: readonly ReturnChange[], scanned: readonly string[], containerCode: string | null): { lines: LineProgress[]; containerNeeded: boolean; containerScanned: boolean; done: boolean } {
  const codes = new Set(scanned);
  const containerScanned = containerCode !== null && codes.has(containerCode);
  const physical = changes.reduce((sum, change) => sum + change.returned + change.damaged, 0);
  const containerNeeded = containerCode !== null && physical > 0;
  const result: LineProgress[] = [];
  for (const line of lines) {
    const change = changes.find((c) => c.lineId === line.id);
    if (!change || change.returned + change.damaged === 0) continue;
    if (line.assetCode) {
      const have = codes.has(line.assetCode) ? 1 : 0;
      result.push({ lineId: line.id, name: line.name, need: 1, have, hint: have ? "Asset tag scanned" : "Scan the asset tag" });
    } else {
      const have = codes.has(line.itemCode) || containerCode !== null ? 1 : 0;
      result.push({ lineId: line.id, name: line.name, need: 1, have, hint: have ? "Label scanned" : "Scan the item label" });
    }
  }
  return { lines: result, containerNeeded, containerScanned, done: result.every((line) => line.have >= line.need) && (!containerNeeded || containerScanned) };
}

/** Units of a return change, checked against what is still out. */
export function changeIsValid(change: ReturnChange, outstanding: number): boolean {
  const values = [change.returned, change.damaged, change.lost];
  return values.every((n) => Number.isSafeInteger(n) && n >= 0) && values.reduce((a, b) => a + b, 0) <= outstanding;
}
