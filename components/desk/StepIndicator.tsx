import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

type Props = {
  titles: readonly string[];
  /** Index of the step on screen; ignored once `finished`. */
  current: number;
  /** The furthest step the person may jump back or forward to. */
  reachable?: number;
  finished?: boolean;
  onSelect?: (index: number) => void;
};

/**
 * The numbered steps of a desk flow, ending in "Done". Earlier steps are
 * buttons when `onSelect` is given; the step on screen carries aria-current.
 * Hook-free, so the completion card renders it on the server.
 */
export function StepIndicator({ titles, current, reachable = -1, finished = false, onSelect }: Props) {
  const steps = [...titles, "Done"];
  const last = steps.length - 1;
  return (
    <ol aria-label="Steps" className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((title, index) => {
        const active = finished ? index === last : index === current;
        const passed = finished ? index < last : index < current;
        const marker = (
          <>
            <span aria-hidden className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
              passed || (finished && active) ? "bg-success-bg text-success-fg" : active ? "bg-primary text-on-primary" : "bg-surface text-ink-muted",
            )}>
              {passed || (finished && active) ? <CircleCheck className="size-4" /> : index + 1}
            </span>
            <span className={cn("text-label", active ? "text-ink" : "hidden text-ink-muted sm:inline")}>
              <span className="sr-only">Step {index + 1}: </span>{title}{passed ? <span className="sr-only">, done</span> : null}
            </span>
          </>
        );
        const selectable = Boolean(onSelect) && !finished && index < last && index !== current && index <= reachable;
        return (
          <li key={title} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
            {index > 0 ? <span aria-hidden className="mx-1 h-px w-4 bg-line-strong" /> : null}
            {selectable ? (
              <button type="button" onClick={() => onSelect!(index)} className="inline-flex min-h-11 items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--yy-focus)]">
                {marker}
              </button>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-2 px-1.5">{marker}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
