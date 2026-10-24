/**
 * Client-safe scan helpers for the desk flows. They mirror
 * `extractQrCode` in lib/catalogue/qr.ts (which pulls in node:crypto, so it
 * can't ship to the browser); tests keep the two in step. The server always
 * re-resolves every code, so this only gives the person at the desk fast
 * feedback.
 */

const QR_CODE_PATTERN = /^[IALKC][23456789A-HJ-NP-Z]{15}$/;

export type ScanKind = "item" | "asset" | "location" | "kit" | "container";

const KIND_BY_PREFIX: Record<string, ScanKind> = { I: "item", A: "asset", L: "location", K: "kit", C: "container" };

/** The bare code from a scanned label (a /q/<code> URL or the code itself), or null. */
export function normalizeScan(raw: string): string | null {
  const value = raw.trim();
  const fromUrl = value.match(/\/q\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/);
  const code = (fromUrl ? fromUrl[1]! : value).toUpperCase();
  return QR_CODE_PATTERN.test(code) ? code : null;
}

export function scanKindOf(code: string): ScanKind | null {
  return KIND_BY_PREFIX[code[0] ?? ""] ?? null;
}

export const SCAN_KIND_WORD: Record<ScanKind, string> = { item: "Item label", asset: "Asset tag", location: "Location", kit: "Kit", container: "Container" };

/** Add a code once; reports whether it was new. */
export function addScan(list: readonly string[], code: string): { list: string[]; added: boolean } {
  if (list.includes(code)) return { list: [...list], added: false };
  return { list: [...list, code], added: true };
}

/** Lines of a desk flow that still need scans: `need` labels, `have` scanned so far. */
export function scanProgress(lines: ReadonlyArray<{ need: number; have: number }>) {
  const need = lines.reduce((sum, line) => sum + line.need, 0);
  const have = lines.reduce((sum, line) => sum + Math.min(line.have, line.need), 0);
  return { need, have, remaining: Math.max(0, need - have), done: have >= need };
}
