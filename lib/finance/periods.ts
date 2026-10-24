/**
 * Finance periods (pure, unit tested). Days are calendar days (YYYY-MM-DD)
 * in the space time zone. Weeks start on Monday; the financial year runs
 * April to March (Indian convention, the default for Space Works spaces).
 */

export const PERIOD_GROUPS = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "fy", label: "Financial year" },
] as const;

export type PeriodGroup = (typeof PERIOD_GROUPS)[number]["key"];

export function isPeriodGroup(value: unknown): value is PeriodGroup {
  return typeof value === "string" && PERIOD_GROUPS.some((group) => group.key === value);
}

function parts(day: string) {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The financial year a day falls in, as its starting calendar year (2026-03-31 → 2025). */
export function financialYearOf(day: string) {
  const { y, m } = parts(day);
  return m >= 4 ? y : y - 1;
}

export function financialYearRange(startYear: number) {
  return { fromDay: `${startYear}-04-01`, toDay: `${startYear + 1}-03-31` };
}

export function financialYearLabel(startYear: number) {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Monday of the week a day falls in. */
function mondayOf(day: string) {
  const { y, m, d } = parts(day);
  const date = new Date(Date.UTC(y, m - 1, d));
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

/** A sortable key for the period that holds `day`. */
export function periodKey(day: string, group: PeriodGroup) {
  switch (group) {
    case "day": return day;
    case "week": return mondayOf(day);
    case "month": return day.slice(0, 7);
    case "fy": return String(financialYearOf(day));
  }
}

/** A short label for a period key ("2026-10-24" → "24 Oct 2026", "2026-10" → "Oct 2026", "2026" → "FY 2026-27"). */
export function periodLabel(key: string, group: PeriodGroup) {
  if (group === "fy") return financialYearLabel(Number(key));
  if (group === "month") {
    const { y, m } = parts(`${key}-01`);
    return `${MONTHS[m - 1]} ${y}`;
  }
  const { y, m, d } = parts(key);
  return group === "week" ? `Week of ${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]} ${y}`;
}
