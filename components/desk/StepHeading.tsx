import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { cn } from "@/lib/cn";

/** A progress marker for stacked desk sections; the first unmet step is current. */
export function StepHeading({ step, completed, children }: { step: number; completed: readonly boolean[]; children: ReactNode }) {
  const done = completed[step - 1];
  const current = completed.findIndex((complete) => !complete) === step - 1;
  return (
    <h3 className="flex items-center gap-3 text-label text-ink" aria-current={current ? "step" : undefined}>
      <span className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full tabular-nums",
        done ? "bg-success-bg text-success-fg" : current ? "bg-accent-soft text-accent-text" : "bg-surface text-ink-muted",
      )} aria-hidden="true">
        {done ? <CircleCheck className="size-4" /> : step}
      </span>
      <span><span className="sr-only">Step {step}. </span>{children}{done ? <span className="sr-only">. Done</span> : null}</span>
    </h3>
  );
}
