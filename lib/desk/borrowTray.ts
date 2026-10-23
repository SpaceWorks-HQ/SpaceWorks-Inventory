/** The member's request tray (pure, client-safe): what they want to borrow before they send the request. */

export type TrayLine = { itemId: string; quantity: number };

export const TRAY_MAX_LINES = 20;
export const TRAY_MAX_QUANTITY = 99;

const clamp = (quantity: number) => Math.max(1, Math.min(TRAY_MAX_QUANTITY, Math.floor(quantity)));

/** Add units of an item (merging with what is already there). Refuses a 21st item. */
export function addToTray(tray: readonly TrayLine[], itemId: string, quantity = 1): { tray: TrayLine[]; added: boolean } {
  const existing = tray.find((line) => line.itemId === itemId);
  if (existing) return { tray: tray.map((line) => (line.itemId === itemId ? { ...line, quantity: clamp(line.quantity + quantity) } : line)), added: true };
  if (tray.length >= TRAY_MAX_LINES) return { tray: [...tray], added: false };
  return { tray: [...tray, { itemId, quantity: clamp(quantity) }], added: true };
}

/** Add every line of a kit at once; stops at the item limit. */
export function addKitToTray(tray: readonly TrayLine[], lines: ReadonlyArray<{ itemId: string; quantity: number }>): { tray: TrayLine[]; added: boolean } {
  let next = [...tray];
  let added = true;
  for (const line of lines) {
    const result = addToTray(next, line.itemId, line.quantity);
    next = result.tray;
    added &&= result.added;
  }
  return { tray: next, added };
}

export function setTrayQuantity(tray: readonly TrayLine[], itemId: string, quantity: number): TrayLine[] {
  if (quantity <= 0) return tray.filter((line) => line.itemId !== itemId);
  return tray.map((line) => (line.itemId === itemId ? { ...line, quantity: clamp(quantity) } : line));
}

export function trayUnits(tray: readonly TrayLine[]): number {
  return tray.reduce((sum, line) => sum + line.quantity, 0);
}

/** Read a stored tray, keeping only well-formed lines for items that still exist. */
export function parseTray(raw: string | null, knownItemIds?: ReadonlySet<string>): TrayLine[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    const lines: TrayLine[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const { itemId, quantity } = entry as Record<string, unknown>;
      if (typeof itemId !== "string" || typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 1) continue;
      if (knownItemIds && !knownItemIds.has(itemId)) continue;
      if (lines.some((line) => line.itemId === itemId) || lines.length >= TRAY_MAX_LINES) continue;
      lines.push({ itemId, quantity: clamp(quantity) });
    }
    return lines;
  } catch {
    return [];
  }
}

export function trayStorageKey(slug: string) {
  return `swi:tray:${slug}`;
}
