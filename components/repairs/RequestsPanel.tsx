"use client";

import { useMemo, useState } from "react";
import type { RepairRequestStatus, TechnicianKind } from "@prisma/client";
import { assignTechnicianAction, sendRepairRequestsAction, withdrawRepairRequestAction } from "@/app/actions/repairs";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { CheckboxField, FilterChip } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";
import { CHANNEL_LABEL } from "@/lib/repairs/channels";
import { RequestChip } from "./RepairChips";

type Technician = { id: string; name: string; kind: TechnicianKind; skills: string[] };
type Request = { id: string; technicianId: string; technician: string; external: boolean; status: RepairRequestStatus; channels: string[]; sentLabel: string };

/** Pick technicians (filter by skill) and send them the request on every channel they have, or assign one directly. */
export function RequestsPanel({ slug, issueId, open, requests, technicians }: { slug: string; issueId: string; open: boolean; requests: Request[]; technicians: Technician[] }) {
  const [skill, setSkill] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [direct, setDirect] = useState("");
  const { run, pending, error } = useActionRunner();
  const skills = useMemo(() => [...new Set(technicians.flatMap((technician) => technician.skills))].sort(), [technicians]);
  const waiting = new Set(requests.filter((request) => request.status === "SENT").map((request) => request.technicianId));
  const shown = technicians.filter((technician) => !skill || technician.skills.includes(skill));
  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? [...list, id] : list.filter((entry) => entry !== id)));

  return (
    <Card as="section" aria-label="Technicians">
      <CardHeader title="Technicians" description={open ? "Ask one or more. The first to accept gets the job; the others are told and their links close." : undefined} titleAs="h2" />
      <div className="flex flex-col gap-4">
        {requests.length ? (
          <ul className="flex flex-col gap-3" aria-label="Who was asked">
            {requests.map((request) => (
              <li key={request.id} className="flex flex-col gap-1 border-b border-line pb-3 last:border-0 last:pb-0">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{request.technician}{request.external ? <span className="font-normal text-ink-muted"> · external</span> : null}</span>
                  <RequestChip status={request.status} />
                </span>
                <span className="text-caption text-ink-muted">{request.sentLabel}{request.channels.length ? ` · ${request.channels.map((channel) => CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL] ?? channel).join(", ")}` : ""}</span>
                {request.status === "SENT" ? <Button size="sm" variant="secondary" className="self-start" disabled={pending} onClick={() => void run(() => withdrawRepairRequestAction(slug, { issueId, requestId: request.id }), "Request withdrawn.")}>Withdraw</Button> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {open ? (
          technicians.length === 0 ? (
            <Callout tone="info">Add technicians to the directory first.</Callout>
          ) : (
            <>
              {skills.length ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by skill">
                  <FilterChip selected={skill === null} onClick={() => setSkill(null)}>All</FilterChip>
                  {skills.map((value) => <FilterChip key={value} selected={skill === value} onClick={() => setSkill(value)}>{value}</FilterChip>)}
                </div>
              ) : null}
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Technicians to ask</legend>
                {shown.map((technician) => (
                  <CheckboxField
                    key={technician.id}
                    label={technician.name}
                    description={[technician.kind === "EXTERNAL" ? "External" : "Member", technician.skills.join(", "), waiting.has(technician.id) ? "already asked" : null].filter(Boolean).join(" · ")}
                    checked={chosen.includes(technician.id)}
                    disabled={waiting.has(technician.id)}
                    onCheckedChange={(value) => toggle(technician.id, value === true)}
                  />
                ))}
              </fieldset>
              <Button variant="primary" loading={pending} disabled={chosen.length === 0} onClick={() => void run(() => sendRepairRequestsAction(slug, { issueId, technicianIds: chosen }), `Request sent to ${chosen.length} ${chosen.length === 1 ? "technician" : "technicians"}.`).then((ok) => ok && setChosen([]))}>Send the request</Button>
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <Field label="Or assign directly">
                  <Dropdown value={direct} onChange={(event) => setDirect(event.target.value)}>
                    <option value="">Choose a technician</option>
                    {technicians.map((technician) => <option key={technician.id} value={technician.id}>{technician.name}</option>)}
                  </Dropdown>
                </Field>
                <Button variant="secondary" disabled={!direct || pending} onClick={() => void run(() => assignTechnicianAction(slug, { issueId, technicianId: direct }), "Technician assigned.")}>Assign</Button>
              </div>
            </>
          )
        ) : null}
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      </div>
    </Card>
  );
}
