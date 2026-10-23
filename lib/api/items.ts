import type { ItemInput } from "@/lib/catalogue/schemas";
import { ApiInputError } from "./errors";

/**
 * PATCH support for items (pure). The catalogue service validates a whole
 * item, so the stored item is turned back into input form and the patch is
 * laid over it. Clearing a text or id field takes `null`.
 */

const TEXT_KEYS = ["sku", "description", "categoryId", "unitId", "supplierId", "barcode", "brand", "model", "notes"] as const;
const NULLABLE_NUMBER_KEYS = ["reorderPoint", "reorderQuantity", "loanDays", "replacementMinor", "depositMinor", "rentalMode", "rentalMinor", "lateFeePerDayMinor"] as const;
const PLAIN_KEYS = ["name", "tracking", "tags", "unitCostMinor", "lendable", "consumable", "selfCheckout", "requiresApproval"] as const;

export const PATCHABLE_ITEM_KEYS: readonly string[] = [...TEXT_KEYS, ...NULLABLE_NUMBER_KEYS, ...PLAIN_KEYS];

export type StoredItem = {
  name: string; sku: string; description: string | null; categoryId: string | null; unitId: string | null; supplierId: string | null;
  tracking: "QUANTITY" | "SERIALIZED"; barcode: string | null; brand: string | null; model: string | null; tags: string[];
  unitCostMinor: number; reorderPoint: number | null; reorderQuantity: number | null;
  lendable: boolean; consumable: boolean; selfCheckout: boolean; requiresApproval: boolean; loanDays: number | null;
  replacementMinor: number | null; depositMinor: number | null; rentalMode: "FREE" | "PER_DAY" | "PER_WEEK" | "FLAT" | null; rentalMinor: number | null; lateFeePerDayMinor: number | null;
  notes: string | null;
};

/** The stored item as catalogue input: nullable text becomes undefined (the schema maps it back to null). */
export function itemToInput(item: StoredItem): ItemInput {
  const input: Record<string, unknown> = {};
  for (const key of TEXT_KEYS) input[key] = item[key] ?? undefined;
  for (const key of NULLABLE_NUMBER_KEYS) input[key] = item[key];
  for (const key of PLAIN_KEYS) input[key] = item[key];
  return input as ItemInput;
}

/** Lay a PATCH body over the stored item. Unknown fields are refused so typos never pass silently. */
export function mergeItemPatch(item: StoredItem, patch: unknown): ItemInput {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new ApiInputError("Send a JSON object with the fields to change.");
  const entries = Object.entries(patch as Record<string, unknown>);
  if (entries.length === 0) throw new ApiInputError("Send at least one field to change.");
  const unknown = entries.map(([key]) => key).filter((key) => !PATCHABLE_ITEM_KEYS.includes(key));
  if (unknown.length > 0) throw new ApiInputError(`Unknown or read-only fields: ${unknown.slice(0, 5).join(", ")}.`);
  const input = itemToInput(item) as Record<string, unknown>;
  for (const [key, value] of entries) {
    if ((TEXT_KEYS as readonly string[]).includes(key)) input[key] = value === null ? "" : value;
    else input[key] = value;
  }
  return input as ItemInput;
}
