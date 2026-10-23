"use client";

import { useState } from "react";
import { LocationPicker, type LocationOption } from "@/components/desk/LocationPicker";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Textarea } from "@/components/ui/field";
import { INCIDENT_RESOLUTIONS, RESOLUTION_LABEL } from "@/lib/desk/loansSchemas";
import type { IncidentView } from "./IncidentList";

type Resolution = (typeof INCIDENT_RESOLUTIONS)[number];

/** Close an incident with a note and the shelf for found or damaged stock. */
export function ResolveIncidentDialog({ incident, locations, pending, error, onClose, onConfirm }: {
  incident: IncidentView; locations: LocationOption[]; pending: boolean; error: string | null;
  onClose: () => void; onConfirm: (input: { resolution: Resolution; note: string; locationId: string | null }) => void;
}) {
  const options = INCIDENT_RESOLUTIONS.filter((r) => (r === "FOUND" ? incident.kind === "LOST" : r !== "REPAIRED" || incident.kind === "DAMAGED"));
  const [resolution, setResolution] = useState<Resolution>(options[0]!);
  const [note, setNote] = useState("");
  const [confirmWriteOff, setConfirmWriteOff] = useState(false);
  const [locationId, setLocationId] = useState(incident.kind === "DAMAGED" ? "" : incident.lineLocationId ?? "");
  const needsLocation = resolution === "FOUND" || (incident.kind === "DAMAGED" && (resolution === "REPAIRED" || resolution === "WRITTEN_OFF"));
  const submit = () => onConfirm({ resolution, note: note.trim(), locationId: needsLocation ? locationId : null });
  return (
    <>
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
            {needsLocation ? <LocationPicker locations={locations} value={locationId} onChange={setLocationId} label={resolution === "FOUND" ? "Put it back at" : "Damaged units are at"} helper={resolution === "FOUND" ? undefined : "Choose the shelf where the damaged units were returned."} /> : null}
            <Field label="Note"><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={3} /></Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            {needsLocation && !locationId ? <p className="text-caption text-ink-muted">Choose the shelf before resolving.</p> : !note.trim() ? <p className="text-caption text-ink-muted">Add a resolution note.</p> : null}
            <Button variant={resolution === "WRITTEN_OFF" ? "danger" : "primary"} loading={pending} disabled={!note.trim() || (needsLocation && !locationId)} onClick={() => resolution === "WRITTEN_OFF" ? setConfirmWriteOff(true) : submit()}>{resolution === "WRITTEN_OFF" ? "Write off units…" : "Resolve incident"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmWriteOff}
        title="Write off units?"
        message={`Write off ${incident.quantity} × ${incident.label}. ${incident.kind === "DAMAGED" ? "Damaged stock will be scrapped." : "The units will remain recorded as lost."} This closes the incident; any charges remain due. Automatic borrowing restrictions are rechecked against other open incidents and overdue loans; manual restrictions stay in place.`}
        confirmLabel="Write off units"
        destructive
        loading={pending}
        onCancel={() => setConfirmWriteOff(false)}
        onConfirm={() => { setConfirmWriteOff(false); submit(); }}
      />
    </>
  );
}
