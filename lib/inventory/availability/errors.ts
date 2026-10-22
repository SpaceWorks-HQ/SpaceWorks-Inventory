/** Raised when a change would take a stock balance below zero or past what is free. */
export class StockError extends Error {
  override name = "StockError";
  constructor(message: string, readonly code: "insufficient_stock" | "invalid_quantity" | "asset_unavailable" | "stale_count" = "insufficient_stock") {
    super(message);
  }
}

export function assertPositiveQuantity(quantity: number, what = "Quantity") {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new StockError(`${what} must be a whole number above zero.`, "invalid_quantity");
}

/** Who caused a stock change: a signed-in person, an API key, or the system (null). */
export type Actor = { userId?: string | null; apiTokenId?: string | null };

/** What a movement belongs to, for the ledger and the audit trail. */
export type MovementRef = { refType?: string; refId?: string; note?: string | null };
