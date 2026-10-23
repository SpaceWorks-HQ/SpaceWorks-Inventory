/** Keep uncounted stock movements visible on lines without blocking posting. */
export function countLineTotals(lines: readonly { counted: boolean; stale: boolean }[]) {
  return { lines: lines.length, counted: lines.filter((line) => line.counted).length, stale: lines.filter((line) => line.counted && line.stale).length };
}

/** `staleLines` includes only counted lines, matching the posting workflow. */
export function countReadiness(input: { recordedLines: number; staleLines: number; blocked: boolean }) {
  return {
    submitReason: input.recordedLines === 0 ? "Count at least one line before submitting." : null,
    postReason: input.staleLines > 0 ? "Reopen the count, refresh the stale lines and count them again." : input.blocked ? "Ask another manager who did not start or count this stock to post it." : null,
  };
}
