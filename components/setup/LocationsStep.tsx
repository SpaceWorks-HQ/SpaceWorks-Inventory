"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { saveLocationPlanAction } from "@/app/actions/setup";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";
import { codeFromName, locationPlanProblem, planLocations, type PlannedLocation, type RoomPlan } from "@/lib/setup/wizard";

const KIND_WORD: Record<PlannedLocation["kind"], string> = { BUILDING: "Building", ROOM: "Room", SHELF: "Shelf", BIN: "Bin" };
const count = (value: string) => (/^\d{1,2}$/.test(value) ? Number(value) : 0);

/** Quick builder: one building, its rooms, shelves per room and bins per shelf; then an editable list. */
export function LocationsStep({ slug, existing, nextHref }: { slug: string; existing: number; nextHref: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [building, setBuilding] = useState({ name: "Main building", code: "" });
  const [rooms, setRooms] = useState<Array<{ name: string; shelves: string; bins: string }>>([{ name: "Workshop", shelves: "3", bins: "0" }]);
  const [rows, setRows] = useState<PlannedLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const generate = () => {
    const plan: RoomPlan[] = rooms.map((room) => ({ name: room.name, shelves: count(room.shelves), binsPerShelf: count(room.bins) }));
    setRows(planLocations({ buildingName: building.name, buildingCode: building.code, rooms: plan }));
    setError(null);
  };
  const edit = (key: string, patch: Partial<PlannedLocation>) => setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) ?? null);
  const save = () => {
    if (!rows) return;
    const problem = locationPlanProblem(rows);
    if (problem) return setError(problem);
    startTransition(async () => {
      const result = await saveLocationPlanAction(slug, { rows });
      if (!result.ok) return setError(result.error);
      showToast(`${result.data?.created ?? rows.length} locations added.`, "success");
      router.push(nextHref);
    });
  };

  return (
    <Card padding="lg" className="space-y-6">
      <CardHeader title="Where things live" description={existing > 0 ? `This space already has ${existing} locations. Anything you add here sits alongside them.` : "Describe one building; you can add more later from Locations. Codes are printed on shelf labels."} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field label="Building">
          <Input value={building.name} maxLength={80} onChange={(e) => setBuilding((b) => ({ ...b, name: e.target.value }))} />
        </Field>
        <Field label="Code" optional helperText={`Defaults to ${codeFromName(building.name, "B1")}`}>
          <Input value={building.code} maxLength={8} onChange={(e) => setBuilding((b) => ({ ...b, code: e.target.value.toUpperCase() }))} />
        </Field>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-label text-ink">Rooms</legend>
        {rooms.map((room, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_120px]">
            <Field label={`Room ${index + 1} name`}>
              <Input value={room.name} maxLength={80} onChange={(e) => setRooms((list) => list.map((r, i) => (i === index ? { ...r, name: e.target.value } : r)))} />
            </Field>
            <Field label="Shelves">
              <Input inputMode="numeric" value={room.shelves} onChange={(e) => setRooms((list) => list.map((r, i) => (i === index ? { ...r, shelves: e.target.value } : r)))} />
            </Field>
            <Field label="Bins per shelf">
              <Input inputMode="numeric" value={room.bins} onChange={(e) => setRooms((list) => list.map((r, i) => (i === index ? { ...r, bins: e.target.value } : r)))} />
            </Field>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" startIcon={<Plus />} disabled={rooms.length >= 20} onClick={() => setRooms((list) => [...list, { name: "", shelves: "2", bins: "0" }])}>Add a room</Button>
          {rooms.length > 1 ? <Button variant="quiet" onClick={() => setRooms((list) => list.slice(0, -1))}>Remove last room</Button> : null}
        </div>
      </fieldset>
      <Button variant={rows ? "secondary" : "primary"} onClick={generate}>{rows ? "Rebuild the list" : "Build the list"}</Button>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {rows ? (
        <div className="space-y-4">
          <p className="text-body-ui text-ink-secondary">{rows.length} locations. Rename anything before saving.</p>
          <Table label="Planned locations">
            <THead><tr><TH>Kind</TH><TH>Name</TH><TH>Code</TH></tr></THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.key}>
                  <TD className="whitespace-nowrap text-ink-muted">{KIND_WORD[row.kind]}</TD>
                  <TD className="min-w-[180px]">
                    <Input aria-label={`Name for ${row.code}`} value={row.name} maxLength={80} onChange={(e) => edit(row.key, { name: e.target.value })} />
                  </TD>
                  <TD className="min-w-[160px]">
                    <Input aria-label={`Code for ${row.name}`} value={row.code} maxLength={24} onChange={(e) => edit(row.key, { code: e.target.value.toUpperCase() })} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Button variant="primary" loading={pending} onClick={save}>Save locations</Button>
        </div>
      ) : null}
    </Card>
  );
}
