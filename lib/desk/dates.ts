import { safeTimeZone, zonedInputToIso } from "@/lib/timeZone";

/**
 * A `<input type="date">` value ("2026-10-24") read as a time of day in the
 * space's time zone. Returns null for blank input and NaN-date for nonsense,
 * so schemas can tell "not given" from "wrong".
 */
export function dateInputToDate(value: string | null | undefined, timeZone: string, time = "17:00"): Date | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return new Date(Number.NaN);
  const iso = zonedInputToIso(`${trimmed}T${time}`, safeTimeZone(timeZone));
  return iso ? new Date(iso) : new Date(Number.NaN);
}

/** "2026-10-24" for a date input, in the space's time zone. */
export function dateInputValue(date: Date | null | undefined, timeZone: string): string {
  if (!date || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: safeTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
