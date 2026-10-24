import Link from "next/link";
import { Patch } from "@/components/brand/Patch";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/display";
import { DONE_COPY, type DoneKind } from "@/lib/desk/stepper";
import { StepIndicator } from "./StepIndicator";

/**
 * The "done" step of a desk flow, shown on the record page after `?done=<kind>`.
 * `homeAgain` (everything on the loan came back) adds Patch trotting home, an
 * easter egg (docs/DESIGN.md); it is the card's only bold moment.
 */
export function HandoverDone({ kind, dismissHref, homeAgain = false }: { kind: DoneKind; dismissHref: string; homeAgain?: boolean }) {
  const copy = DONE_COPY[kind];
  return (
    <Card as="section" aria-label={copy.title} className="flex flex-col gap-4">
      <StepIndicator titles={copy.steps} current={copy.steps.length} finished />
      {homeAgain ? <span data-egg="home-again" className="self-start"><Patch pose="walk" size={72} /></span> : null}
      <div role="status" className="flex flex-col gap-1">
        <h2 className="text-h4 text-ink">{copy.title}</h2>
        <p className="text-body-ui text-ink-secondary">{copy.body}</p>
      </div>
      <Button asChild variant="secondary" className="self-start"><Link href={dismissHref} scroll={false}>Dismiss</Link></Button>
    </Card>
  );
}
