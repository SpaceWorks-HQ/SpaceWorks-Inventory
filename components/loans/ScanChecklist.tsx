import { Chip } from "@/components/ui/display";
import type { LineProgress } from "@/lib/desk/loansProgress";

/** What is still to scan, per line, with a word on every status. */
export function ScanChecklist({ lines, extra }: { lines: LineProgress[]; extra?: { label: string; done: boolean } | null }) {
  if (lines.length === 0 && !extra) return null;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-panel" aria-label="Still to scan">
      {lines.map((line) => (
        <li key={line.lineId} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span className="min-w-0">
            <span className="block text-body-ui text-ink">{line.name}</span>
            <span className="block text-caption text-ink-muted">{line.hint}</span>
          </span>
          <Chip tone={line.have >= line.need ? "success" : "warning"}>{line.have >= line.need ? "Done" : `${Math.min(line.have, line.need)} of ${line.need}`}</Chip>
        </li>
      ))}
      {extra ? (
        <li className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-2">
          <span className="text-body-ui text-ink">{extra.label}</span>
          <Chip tone={extra.done ? "success" : "warning"}>{extra.done ? "Scanned" : "To scan"}</Chip>
        </li>
      ) : null}
    </ul>
  );
}
