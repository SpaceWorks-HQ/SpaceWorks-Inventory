"use client";

import { useState } from "react";
import { resolveIncidentAction } from "@/app/actions/loans";
import type { LocationOption } from "@/components/desk/LocationPicker";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip } from "@/components/ui/display";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { ResolveIncidentDialog } from "./ResolveIncidentDialog";

export type IncidentView = {
  id: string; kind: "LOST" | "DAMAGED"; quantity: number; description: string; open: boolean; label: string;
  resolutionLabel: string | null; resolutionNote: string | null; whenLabel: string; lineLocationId?: string | null;
};

/** Lost or damaged items on a loan; managers resolve them (borrower view is read-only). */
export function IncidentList({ slug, incidents, canResolve, locations }: { slug: string; incidents: IncidentView[]; canResolve: boolean; locations: LocationOption[] }) {
  const [resolving, setResolving] = useState<IncidentView | null>(null);
  const runner = useActionRunner();
  if (incidents.length === 0) return null;
  return (
    <Card as="section" aria-label="Incidents">
      <CardHeader title="Incidents" description="Lost or damaged units. While one is open the member may be restricted from borrowing." />
      <ul className="flex flex-col divide-y divide-line">
        {incidents.map((incident) => (
          <li key={incident.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-label text-ink">{incident.quantity} × {incident.label}</span>
              <span className="flex items-center gap-2">
                <Chip tone={incident.kind === "LOST" ? "danger" : "warning"}>{incident.kind === "LOST" ? "Lost" : "Damaged"}</Chip>
                <Chip tone={incident.open ? "warning" : "success"}>{incident.open ? "Open" : "Resolved"}</Chip>
              </span>
            </div>
            <p className="text-caption text-ink-muted">{incident.whenLabel}</p>
            <p className="text-body-ui text-ink-secondary">{incident.description}</p>
            {incident.resolutionLabel ? <p className="text-body-ui text-ink">{incident.resolutionLabel}{incident.resolutionNote ? `: ${incident.resolutionNote}` : ""}</p> : null}
            {incident.open && canResolve ? <Button variant="secondary" size="sm" className="self-start" onClick={() => { runner.setError(null); setResolving(incident); }}>Resolve</Button> : null}
          </li>
        ))}
      </ul>
      {resolving ? (
        <ResolveIncidentDialog
          incident={resolving}
          locations={locations}
          pending={runner.pending}
          error={runner.error}
          onClose={() => setResolving(null)}
          onConfirm={(input) => void runner.run(() => resolveIncidentAction(slug, { incidentId: resolving.id, ...input }), "Incident resolved.").then((ok) => { if (ok) setResolving(null); })}
        />
      ) : null}
    </Card>
  );
}
