import { MapPin } from "lucide-react";
import { Card, EmptyState } from "@/components/ui/display";
import type { CountLineView } from "@/lib/desk/countsDetail";
import { CountLineRow } from "./CountLineRow";

/** The counting sheet: one block per location, in path order. */
export function CountSheet({ slug, countId, groups, editable }: { slug: string; countId: string; groups: Array<{ locationPath: string; lines: CountLineView[] }>; editable: boolean }) {
  if (groups.length === 0) return <EmptyState>Nothing was on hand in this scope when the count started. Add what you find below.</EmptyState>;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.locationPath} as="section" padding="none" className="overflow-hidden" aria-label={group.locationPath}>
          <h2 className="flex items-center gap-2 border-b border-line bg-surface px-4 py-3 text-label text-ink">
            <MapPin aria-hidden className="size-4 shrink-0 text-ink-muted" />
            {group.locationPath}
            <span className="text-caption tabular-nums text-ink-muted">({group.lines.length})</span>
          </h2>
          <ul className="divide-y divide-line">
            {group.lines.map((line) => <CountLineRow key={`${line.id}:${line.countedQty ?? ""}`} slug={slug} countId={countId} line={line} editable={editable} />)}
          </ul>
        </Card>
      ))}
    </div>
  );
}
