import { safeTimeZone, zonedDatetimeLocalValue, zonedInputToIso } from "@/lib/timeZone";

/**
 * Report date ranges (pure, unit tested). The form sends calendar days
 * (YYYY-MM-DD) in the space time zone; `to` is inclusive for people and
 * exclusive (start of the next day) for queries.
 */
export type DateRange = { from: Date; to: Date; fromDay: string; toDay: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 366;
export const DEFAULT_RANGE_DAYS = 30;

/** Calendar day of an instant in the zone, "2026-10-23". */
export function dayInZone(date: Date, timeZone: string) {
  return zonedDatetimeLocalValue(date, safeTimeZone(timeZone)).slice(0, 10);
}

function shiftDay(day: string, days: number) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isRealDay(day: string) {
  if (!DAY.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Midnight at the start of `day` in the zone. */
export function startOfDay(day: string, timeZone: string): Date {
  const zone = safeTimeZone(timeZone);
  const iso = zonedInputToIso(`${day}T00:00`, zone) ?? zonedInputToIso(`${day}T01:00`, zone) ?? `${day}T00:00:00.000Z`;
  return new Date(iso);
}

/**
 * Parse `?from=&to=`. Anything missing or invalid falls back to the last
 * 30 days ending today; swapped days are put in order and the span is
 * capped at a year (counting back from `to`).
 */
export function parseRange(input: { from?: unknown; to?: unknown }, timeZone: string, now: Date = new Date()): DateRange {
  const today = dayInZone(now, timeZone);
  let toDay = typeof input.to === "string" && isRealDay(input.to) ? input.to : today;
  let fromDay = typeof input.from === "string" && isRealDay(input.from) ? input.from : shiftDay(toDay, -(DEFAULT_RANGE_DAYS - 1));
  if (fromDay > toDay) [fromDay, toDay] = [toDay, fromDay];
  const earliest = shiftDay(toDay, -(MAX_DAYS - 1));
  if (fromDay < earliest) fromDay = earliest;
  return { from: startOfDay(fromDay, timeZone), to: startOfDay(shiftDay(toDay, 1), timeZone), fromDay, toDay };
}

/** Every calendar day from `fromDay` to `toDay` inclusive (capped at a year). */
export function eachDay(fromDay: string, toDay: string): string[] {
  const days: string[] = [];
  for (let day = fromDay; day <= toDay && days.length < MAX_DAYS; day = shiftDay(day, 1)) days.push(day);
  return days;
}
