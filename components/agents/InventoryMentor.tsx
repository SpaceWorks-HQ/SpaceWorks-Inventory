"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { MentorCandidate, MentorPlan } from "@spaceworks-hq/agents/mentor";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";

function Candidate({ candidate, alternative }: { candidate: MentorCandidate; alternative: boolean }) {
  return <Card className="space-y-3">
    <div className="flex flex-wrap gap-2"><Chip tone={alternative ? "info" : "success"}>{alternative ? "Catalogue alternative" : "Primary candidate"}</Chip><Chip>{candidate.kind}</Chip></div>
    <h3 className="text-lg font-semibold">{candidate.name}</h3>
    <p>{candidate.available} available · {candidate.location}</p><p className="text-ink-secondary">{candidate.reason}</p>
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink-secondary">{candidate.checks.map((value, index) => <li key={index}>{value}</li>)}</ul>
    {candidate.handoff ? <Link className={buttonClasses({ variant: "secondary" })} href={candidate.handoff.path}>{candidate.handoff.label}</Link> : null}
    <p className="text-sm text-ink-secondary">{candidate.handoff?.reason}</p>
  </Card>;
}

export function InventoryMentor({ slug }: { slug: string }) {
  const [plan, setPlan] = useState<MentorPlan | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true); setPlan(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/ops/v1/${encodeURIComponent(slug)}/mentor/plan`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ project: String(data.get("project") ?? ""), goal: String(data.get("goal") ?? ""), constraints: String(data.get("constraints") ?? "") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "The mentor could not prepare a plan. Try again.");
      setPlan(result as MentorPlan);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The mentor could not prepare a plan."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <Callout title="Discussion first, native operations afterwards">The mentor reads the catalogue and stock for this space. It does not take stock, reserve items, approve loans or replace physical QR scans and photo evidence.</Callout>
    <Card><form onSubmit={submit} className="space-y-4">
      <Field label="Project name" required><Input name="project" maxLength={160} placeholder="Weather station" required /></Field>
      <Field label="What should the project do?" required><Textarea name="goal" maxLength={2000} placeholder="Measure temperature and humidity in a greenhouse." required /></Field>
      <Field label="Constraints and existing hardware" optional><Textarea name="constraints" maxLength={1000} placeholder="Controller, voltage, interfaces, environment, range and accuracy." /></Field>
      <Button type="submit" disabled={busy}>{busy ? "Preparing discussion…" : "Discuss the project"}</Button>
    </form></Card>
    {error ? <Callout tone="danger" title="Plan unavailable" role="alert">{error}</Callout> : null}
    {plan ? <div className="space-y-6" aria-live="polite">
      <Card><CardHeader title="Questions to discuss" /><ul className="list-disc space-y-2 pl-5">{plan.questions.map((value, index) => <li key={index}>{value}</li>)}</ul></Card>
      {plan.lines.map(line => <section key={line.capability} className="space-y-4"><h2 className="text-xl font-semibold">{line.quantity} × {line.capability}</h2>
        {line.gap ? <Callout tone="warning">{line.gap}</Callout> : null}
        {line.primary ? <Candidate candidate={line.primary} alternative={false} /> : null}
        {line.alternatives.map(candidate => <Candidate key={candidate.itemId} candidate={candidate} alternative />)}
      </section>)}
      <Callout tone="warning" title="Review before selecting"><ul className="list-disc space-y-2 pl-5">{plan.warnings.map((value, index) => <li key={index}>{value}</li>)}</ul></Callout>
    </div> : null}
  </div>;
}
