import { Card } from "@/components/ui/display";
import { compactNumber, linePoints, niceMax, ticks } from "@/lib/reports/chart";

export type LineSeries = { label: string; values: number[]; dashed?: boolean };

const WIDTH = 600;
const HEIGHT = 160;

/**
 * Daily line chart drawn with tokens. Two series at most: solid teal and a
 * dashed warning line, named in a legend so colour is never the only cue.
 * Axis text is HTML so it stays readable at any width.
 */
export function LineChart({ title, days, series, summary }: { title: string; days: string[]; series: LineSeries[]; summary: string }) {
  if (days.length < 2) return null;
  const top = niceMax(Math.max(1, ...series.flatMap((line) => line.values)));
  return (
    <Card padding="sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-label text-ink">{title}</p>
        <ul className="flex flex-wrap gap-4 text-caption text-ink-muted">
          {series.map((line) => (
            <li key={line.label} className="inline-flex items-center gap-2">
              <svg aria-hidden viewBox="0 0 24 4" className="h-1 w-6">
                <line x1={0} y1={2} x2={24} y2={2} strokeWidth={3} strokeDasharray={line.dashed ? "5 3" : undefined} className={line.dashed ? "stroke-warning-solid" : "stroke-accent-text"} />
              </svg>
              {line.label}
            </li>
          ))}
        </ul>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div aria-hidden className="flex h-40 flex-col justify-between text-right text-caption tabular-nums text-ink-muted">
          {ticks(top, 2).reverse().map((tick) => <span key={tick}>{compactNumber(tick)}</span>)}
        </div>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label={`${title}. ${summary}`}>
          {ticks(top, 2).map((tick) => (
            <line key={tick} x1={0} x2={WIDTH} y1={HEIGHT - (tick / top) * HEIGHT} y2={HEIGHT - (tick / top) * HEIGHT} strokeWidth={1} vectorEffect="non-scaling-stroke" className="stroke-line" />
          ))}
          {series.map((line) => (
            <polyline
              key={line.label}
              fill="none"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={line.dashed ? "6 4" : undefined}
              className={line.dashed ? "stroke-warning-solid" : "stroke-accent-text"}
              points={linePoints(line.values, top, WIDTH, HEIGHT).map(([x, y]) => `${x},${y}`).join(" ")}
            />
          ))}
        </svg>
        <span />
        <div aria-hidden className="mt-1 flex justify-between text-caption text-ink-muted">
          <span>{days[0]}</span>
          <span>{days[days.length - 1]}</span>
        </div>
      </div>
    </Card>
  );
}
