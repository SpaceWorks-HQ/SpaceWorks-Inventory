import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { SETUP_STEPS } from "@/lib/setup/wizard";

/** Step list with progress; every step stays reachable so the wizard can be re-entered. */
export function SetupProgress({ slug, step }: { slug: string; step: number }) {
  return (
    <nav aria-label="Setup steps" className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-body-ui text-ink-muted">
        <span>Step {step} of {SETUP_STEPS.length}</span>
        <span>{SETUP_STEPS[step - 1]?.label}</span>
      </div>
      <ProgressBar value={step} max={SETUP_STEPS.length} label="Setup progress" />
      <ol className="flex flex-wrap gap-2">
        {SETUP_STEPS.map((item, index) => {
          const current = index + 1 === step;
          return (
            <li key={item.key}>
              <Link
                href={`/s/${slug}/setup?step=${index + 1}`}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors duration-[120ms] ease-yy",
                  current ? "border-accent-text bg-primary text-on-primary" : "border-line-strong bg-panel text-ink-secondary hover:bg-subtle hover:text-ink",
                )}
              >
                <span className="tabular-nums">{index + 1}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Back / skip links under a step; the step's own form carries the primary action. */
export function StepFooter({ slug, step, nextLabel = "Skip this step" }: { slug: string; step: number; nextLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {step > 1 ? <Link href={`/s/${slug}/setup?step=${step - 1}`} className={buttonClasses({ variant: "quiet" })}>← Back</Link> : <span />}
      {step < SETUP_STEPS.length ? <Link href={`/s/${slug}/setup?step=${step + 1}`} className={buttonClasses({ variant: "secondary" })}>{nextLabel}</Link> : null}
    </div>
  );
}
