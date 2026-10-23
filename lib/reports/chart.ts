/**
 * Chart geometry (pure, unit tested). Charts are hand-drawn SVG, so scales
 * stay simple: a "nice" axis maximum and evenly spaced ticks.
 */

/** Smallest 1/2/2.5/5 × 10^n at or above `value` (1 for empty data). */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * base >= value) return step * base;
  }
  return 10 * base;
}

/** `count` + 1 tick values from 0 to `max`. */
export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
}

/** Pixel length of `value` on an axis `length` long that ends at `max`. */
export function scale(value: number, max: number, length: number): number {
  if (max <= 0 || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, (value / max) * length));
}

/** Points for a polyline through `values`, left to right, inside width × height. */
export function linePoints(values: number[], max: number, width: number, height: number): Array<[number, number]> {
  if (values.length === 0) return [];
  const step = values.length === 1 ? 0 : width / (values.length - 1);
  return values.map((value, index) => [Number((index * step).toFixed(2)), Number((height - scale(value, max, height)).toFixed(2))]);
}

/** Compact axis label: 1200 → "1.2k", 3_400_000 → "3.4M". */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
