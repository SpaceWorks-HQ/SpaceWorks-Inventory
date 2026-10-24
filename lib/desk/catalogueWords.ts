import { formatDayShort } from "@/lib/format/datetime";

export type AvailabilityWord = { text: string; tone: "success" | "warning" | "danger" };

/**
 * The availability word on a catalogue card: "3 available", "On loan until
 * Fri 24 Oct" (the earliest due date of the loans holding it) or "Out of stock".
 */
export function availabilityWord(input: { available: number; earliestDue: Date | null }, timeZone: string, now: Date = new Date()): AvailabilityWord {
  if (input.available > 0) return { text: `${input.available} available`, tone: "success" };
  if (input.earliestDue) return { text: `On loan until ${formatDayShort(input.earliestDue, timeZone, now)}`, tone: "warning" };
  return { text: "Out of stock", tone: "danger" };
}

/** Case-insensitive match on name, SKU, brand, model, category and tags. */
export function matchesSearch(item: { name: string; sku: string; brand: string | null; model: string | null; category: string | null; tags: readonly string[] }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [item.name, item.sku, item.brand, item.model, item.category, ...item.tags].some((value) => value?.toLowerCase().includes(q));
}
