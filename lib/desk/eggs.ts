// Inventory easter eggs (docs/DESIGN.md "Easter eggs"). All decorative: the
// choices of when Patch appears are pure so they are unit-tested.

/** A shelf picked in the stock filter holds nothing: Patch peeks out of the empty bin. */
export function showsEmptyBin(filter: { locationId: string; q: string }, rows: number): boolean {
  return Boolean(filter.locationId) && filter.q.trim() === "" && rows === 0;
}

/** A posted count where every counted line matched: Patch's sneeze, kept for collective success. */
export function perfectCount(count: { status: string; lines: ReadonlyArray<{ countedQty: number | null; variance: number | null }> }): boolean {
  const counted = count.lines.filter((line) => line.countedQty !== null);
  return count.status === "POSTED" && counted.length > 0 && counted.every((line) => line.variance === 0);
}

/** Everything on a loan came back: Patch trots across the completion card. */
export function trotsHome(kind: string, status: string): boolean {
  return (kind === "return" || kind === "self-return") && status === "RETURNED";
}
