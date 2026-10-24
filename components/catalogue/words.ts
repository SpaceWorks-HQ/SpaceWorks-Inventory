/** Plain-language words for catalogue and stock enums (pure, client-safe). */

export const TRACKING_LABEL = { QUANTITY: "By quantity", SERIALIZED: "One by one (serialized)" } as const;

export const LOCATION_KIND_LABEL = {
  SITE: "Site", BUILDING: "Building", FLOOR: "Floor", ROOM: "Room", AREA: "Area", CABINET: "Cabinet", SHELF: "Shelf", BIN: "Bin", OTHER: "Other",
} as const;

export const CONDITION_LABEL = { NEW: "New", GOOD: "Good", FAIR: "Fair", POOR: "Poor", DAMAGED: "Damaged" } as const;

export const RENTAL_MODE_LABEL = { FREE: "Free", PER_DAY: "Per day", PER_WEEK: "Per week", FLAT: "Flat fee per loan" } as const;

export const MOVEMENT_LABEL: Record<string, string> = {
  RECEIPT: "Received",
  ADJUSTMENT: "Adjusted",
  COUNT: "Counted",
  ISSUE: "Issued on loan",
  RETURN: "Returned",
  TRANSFER_OUT: "Sent on transfer",
  TRANSFER_IN: "Received from transfer",
  TRANSFER_RETURN: "Transfer came back",
  TRANSFER_LOSS: "Lost in transit",
  MOVE: "Moved",
  LOSS: "Lost",
  DAMAGE: "To repair shelf",
  REPAIR: "Repaired",
  WRITE_OFF: "Written off",
  RESERVE: "Held",
  RELEASE: "Hold released",
  IMPORT: "Imported",
};

export const REASON_LABEL: Record<string, string> = {
  RECEIVED: "Received",
  FOUND: "Found",
  CORRECTION: "Correction",
  CONSUMED: "Used up",
  LOST: "Lost",
  DAMAGED: "Damaged",
  EXPIRED: "Expired",
  STOLEN: "Stolen",
  DONATED: "Donated",
  RETURNED_TO_SUPPLIER: "Returned to supplier",
  OTHER: "Other",
};

/** Reasons offered for a manual adjustment, by direction. */
export const ADJUST_REASONS = {
  increase: ["FOUND", "CORRECTION", "DONATED", "RECEIVED", "OTHER"],
  decrease: ["CONSUMED", "LOST", "DAMAGED", "EXPIRED", "STOLEN", "RETURNED_TO_SUPPLIER", "CORRECTION", "OTHER"],
} as const;

/** "+3", "−2", "0" with a real minus sign. */
export function signed(value: number) {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}

/** Page links that keep the current filters. */
export function withParams(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    query.set(key, value === true ? "1" : String(value));
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
