import { Card } from "@/components/ui/display";
import { niceMax, scale } from "@/lib/reports/chart";

export type Bar = { label: string; value: number; display: string };

/**
 * Horizontal bar chart drawn with tokens. Labels and values are real text
 * (so they stay readable at 360px and to screen readers); each bar is a
 * small decorative SVG scaled to a shared "nice" maximum. One series, one
 * colour, always shown next to the table with the same numbers.
 */
export function BarChart({ id, title, bars, max = 10 }: { id: string; title: string; bars: Bar[]; max?: number }) {
  const shown = bars.filter((bar) => bar.value > 0).slice(0, max);
  if (shown.length === 0) return null;
  const top = niceMax(Math.max(...shown.map((bar) => bar.value)));
  return (
    <Card padding="sm">
      <p id={`${id}-title`} className="mb-3 text-label text-ink">{title}</p>
      <ul aria-labelledby={`${id}-title`} className="space-y-2.5">
        {shown.map((bar, index) => (
          <li key={`${bar.label}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]">
            <span className="truncate text-body-ui text-ink-secondary">{bar.label}</span>
            <svg aria-hidden viewBox="0 0 100 8" preserveAspectRatio="none" className="order-last col-span-2 h-2.5 w-full sm:order-none sm:col-span-1">
              <rect x={0} y={0} width={100} height={8} rx={2} className="fill-track" />
              <rect x={0} y={0} width={Math.max(1, scale(bar.value, top, 100))} height={8} rx={2} className="fill-accent-text" />
            </svg>
            <span className="text-right text-body-ui font-semibold tabular-nums text-ink">
              <span className="sr-only">: </span>
              {bar.display}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
