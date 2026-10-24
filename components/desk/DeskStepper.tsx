"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { reachableStep } from "@/lib/desk/stepper";
import { StepIndicator } from "./StepIndicator";

export type DeskStep = {
  title: string;
  /** Whether the person may move past this step. */
  ready: boolean;
  /** What is still missing, shown beside the disabled Next. */
  hint: string;
  content: ReactNode;
};

type Props = {
  label: string;
  title: string;
  description: string;
  steps: readonly DeskStep[];
  /** Shown above the steps (for example why the flow is blocked). */
  notice?: ReactNode;
  error: string | null;
  /** The action that ends the flow, shown on the last step. */
  finish: ReactNode;
  /** Why `finish` is disabled when the last step itself is ready. */
  finishHint?: string | null;
};

/**
 * A paged desk flow (docs/DESIGN.md "stepper card"): one step on screen at a
 * time, Next only once the step is ready, earlier steps reachable from the
 * indicator, and focus moved to the new step's heading. The state lives in
 * the flow that renders it, so stepping back loses nothing.
 */
export function DeskStepper({ label, title, description, steps, notice, error, finish, finishHint }: Props) {
  const [current, setCurrent] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  const headingId = useId();
  const index = Math.min(current, steps.length - 1);
  const step = steps[index]!;
  const last = index === steps.length - 1;
  const hint = !step.ready ? step.hint : last ? finishHint : null;

  useEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [index]);
  const go = (next: number) => {
    moved.current = true;
    setCurrent(next);
  };

  return (
    <Card as="section" aria-label={label}>
      <CardHeader title={title} description={description} />
      <div className="flex flex-col gap-6">
        {notice}
        <StepIndicator titles={steps.map((s) => s.title)} current={index} reachable={reachableStep(steps.map((s) => s.ready))} onSelect={go} />
        <section aria-labelledby={headingId} className="flex flex-col gap-4">
          <h3 id={headingId} ref={heading} tabIndex={-1} className="flex flex-wrap items-baseline gap-x-2 text-h4 text-ink focus:outline-none">
            <span className="text-body-ui text-ink-muted">Step {index + 1} of {steps.length}</span>
            {step.title}
          </h3>
          {step.content}
        </section>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          {index > 0 ? <Button variant="secondary" onClick={() => go(index - 1)}>Back</Button> : <span aria-hidden />}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <p className="text-caption text-ink-muted" aria-live="polite">{hint ?? ""}</p>
            {last ? finish : <Button variant="primary" disabled={!step.ready} onClick={() => go(index + 1)}>Next: {steps[index + 1]!.title}</Button>}
          </div>
        </div>
      </div>
    </Card>
  );
}
