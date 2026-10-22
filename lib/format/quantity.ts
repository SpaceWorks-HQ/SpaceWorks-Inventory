/** "12 pcs", "1 m", "3" (no unit). Client-safe. */
export function formatQuantity(quantity: number, unit?: { symbol: string } | null) {
  const value = new Intl.NumberFormat("en-IN").format(quantity);
  return unit ? `${value} ${unit.symbol}` : value;
}

/** Major-unit string from a form input to integer minor units ("12.50" → 1250). Null for blank. */
export function parseMoneyInput(value: string, minorDigits = 2): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return Number.NaN;
  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > minorDigits) return Number.NaN;
  return Number(whole) * 10 ** minorDigits + Number(fraction.padEnd(minorDigits, "0") || 0);
}

/** Integer minor units to a major-unit input value (1250 → "12.50"). */
export function moneyInputValue(minor: number | null | undefined, minorDigits = 2): string {
  if (minor === null || minor === undefined) return "";
  return (minor / 10 ** minorDigits).toFixed(minorDigits);
}
