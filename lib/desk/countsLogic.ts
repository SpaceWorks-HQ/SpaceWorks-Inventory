import type { CountStatus } from "@prisma/client";

import type { CountLineFacts } from "@/lib/counts/variance";
export { lineVariance, type CountLineFacts } from "@/lib/counts/variance";

/** Stock moved since the snapshot (quantity lines only): the line must be refreshed and recounted before posting. */
export function isStale(line: Pick<CountLineFacts, "tracking" | "expectedQty" | "onHand">): boolean {
  return line.tracking === "QUANTITY" && line.onHand !== line.expectedQty;
}

/** Blind counts hide expected quantities (and so variances) while counting is open. */
export function showsExpected(count: { blind: boolean; status: CountStatus }): boolean {
  return !count.blind || count.status !== "IN_PROGRESS";
}

/**
 * Four-eyes rule of postCount: when any variance is above the threshold
 * (null = 0), someone who neither started nor counted the count posts it.
 */
export function fourEyes(input: { variances: number[]; threshold: number | null; viewerId: string; startedById: string | null; counterIds: Array<string | null> }) {
  const threshold = input.threshold ?? 0;
  const overThreshold = input.variances.some((variance) => Math.abs(variance) > threshold);
  const involved = input.startedById === input.viewerId || input.counterIds.includes(input.viewerId);
  return { overThreshold, involved, blocked: overThreshold && involved };
}

export const COUNT_FILTERS = ["open", "submitted", "posted", "cancelled", "all"] as const;
export type CountFilter = (typeof COUNT_FILTERS)[number];

export const COUNT_FILTER_LABEL: Record<CountFilter, string> = { open: "Counting", submitted: "Waiting to post", posted: "Posted", cancelled: "Cancelled", all: "All" };

const FILTER_STATUSES: Record<CountFilter, CountStatus[] | null> = {
  open: ["IN_PROGRESS"], submitted: ["SUBMITTED"], posted: ["POSTED"], cancelled: ["CANCELLED"], all: null,
};

export function countFilterFrom(value: unknown): CountFilter {
  return COUNT_FILTERS.find((filter) => filter === value) ?? "open";
}

export function statusesFor(filter: CountFilter): CountStatus[] | null {
  return FILTER_STATUSES[filter];
}

/** "Shelf A and below · Electronics", "Whole space". */
export function scopeWords(scope: { locationPath: string | null; categoryName: string | null }): string {
  const parts = [scope.locationPath ? `${scope.locationPath} and below` : null, scope.categoryName].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Whole space";
}

/** Group lines by their location path, keeping a stable order of paths. */
export function groupByLocation<T extends { locationPath: string }>(lines: T[]): Array<{ locationPath: string; lines: T[] }> {
  const groups = new Map<string, T[]>();
  for (const line of [...lines].sort((a, b) => a.locationPath.localeCompare(b.locationPath))) {
    const list = groups.get(line.locationPath) ?? [];
    list.push(line);
    groups.set(line.locationPath, list);
  }
  return [...groups].map(([locationPath, list]) => ({ locationPath, lines: list }));
}
