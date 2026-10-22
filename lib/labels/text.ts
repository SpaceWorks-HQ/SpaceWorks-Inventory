/** Text fitting for labels (pure). `measure` returns a string's width in points. */
type Measure = (text: string) => number;

const ELLIPSIS = "…";

/** The text, cut with an ellipsis when it is wider than `maxWidth`. */
export function truncateToWidth(text: string, maxWidth: number, measure: Measure): string {
  if (measure(text) <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low === 0 ? "" : text.slice(0, low).trimEnd() + ELLIPSIS;
}

/** Word-wrap into at most `maxLines` lines; the last line is truncated when text remains. */
export function wrapToWidth(text: string, maxWidth: number, measure: Measure, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let index = 0;
  while (index < words.length && lines.length < maxLines) {
    const candidate = current ? `${current} ${words[index]}` : words[index]!;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      index += 1;
      continue;
    }
    if (!current) {
      // A single word wider than the line: cut it.
      lines.push(truncateToWidth(words[index]!, maxWidth, measure));
      index += 1;
    } else {
      lines.push(current);
      current = "";
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (index < words.length && lines.length > 0) {
    const rest = [lines.pop(), ...words.slice(index)].join(" ");
    lines.push(truncateToWidth(rest, maxWidth, measure));
  }
  return lines;
}

/** A location path that keeps its most specific end: "Main building › Lab › Shelf A" → "… › Lab › Shelf A". */
export function pathToWidth(path: string, maxWidth: number, measure: Measure): string {
  if (measure(path) <= maxWidth) return path;
  const parts = path.split(" › ");
  for (let start = 1; start < parts.length; start += 1) {
    const candidate = `${ELLIPSIS} › ${parts.slice(start).join(" › ")}`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return truncateToWidth(parts[parts.length - 1]!, maxWidth, measure);
}

/** The largest type size from `size` down to `min` (in 0.5 pt steps) at which the text fits. */
export function fitSize(text: string, maxWidth: number, size: number, min: number, measureAt: (text: string, size: number) => number): number {
  let current = size;
  while (current - 0.5 >= min && measureAt(text, current) > maxWidth) current -= 0.5;
  return current;
}
