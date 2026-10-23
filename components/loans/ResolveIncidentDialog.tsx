"use client";

import { useState } from "react";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Textarea } from "@/components/ui/field";
import { INCIDENT_RESOLUTIONS, RESOLUTION_LABEL } from "@/lib/desk/loansSchemas";
import type { IncidentView } from "./IncidentList";

type Resolution = (typeof INCIDENT_RESOLUTIONS)[number];

/** Close an incident: how it was resolved, a note, and where a found item goes. */
export function ResolveIncidentDialog({ incident, locations, pending, error, onClose, onConfirm }: {
  incident: IncidentView; locations: LocationOption[]; pending: boolean; error: string | null;
  onClose: () => void; onConfirm: (input: { resolution: Resolution; note: string; locationId: string | null }) => void;
}) {
  const options = INCIDENT_RESOLUTIONS.filter((r) => (r === "FOUND" ? incident.kind === "LOST" : r !== "REPAIRED" || incident.kind === "DAMAGED"));
  const [resolution, setResolution] = useState<Resolution>(options[0]!);
  const [note, setNote] = useState("");
  const [locationId, setLocationId] = useState(incident.lineLocationId ?? "");
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent size="sm">
        <DialogHeader title="Resolve incident" description={`${incident.quantity} × ${incident.label}`} />
        <DialogBody className="flex flex-col gap-3">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <Field label="Resolution" helperText={resolution === "WAIVED" ? "Also waives any charge for it, with your note as the reason." : resolution === "WRITTEN_OFF" ? "Damaged units are scrapped." : undefined}>
            <Dropdown value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}>
              {options.map((r) => <option key={r} value={r}>{RESOLUTION_LABEL[r]}</option>)}
            </Dropdown>
          </Field>
          {resolution === "FOUND" ? <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label="Put it back at" /> : null}
          <Field label="Note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" loading={pending} disabled={!note.trim() || (resolution === "FOUND" && !locationId)} onClick={() => onConfirm({ resolution, note: note.trim(), locationId: resolution === "FOUND" ? locationId : null })}>Resolve incident</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
