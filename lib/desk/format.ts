/** Small client-safe words for the desk pages. */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Ada Lovelace" or the email when the person has no name. */
export function personName(person: { name: string | null; email?: string | null } | null | undefined, fallback = "Someone"): string {
  return person?.name?.trim() || person?.email || fallback;
}

/** A positive integer from a form field, or null when blank or wrong. */
export function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,7}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** "+3", "−2", "0" for variances. */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return "0";
}
