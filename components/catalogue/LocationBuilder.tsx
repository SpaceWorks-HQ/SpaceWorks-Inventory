"use client";

import { useState } from "react";
import { buildLocationsAction } from "@/app/actions/catalogue";
import { StockDialog } from "@/components/stock/StockDialog";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { useRunAction } from "./useRunAction";
import type { ParentOption } from "./LocationDialog";

const whole = (value: string) => (/^\d{1,3}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);

/** "Add a building with N rooms, each with N shelves" in one go, with generated codes. */
export function LocationBuilder({ open, onOpenChange, slug, parents }: { open: boolean; onOpenChange: (open: boolean) => void; slug: string; parents: ParentOption[] }) {
  const { pending, error, run, reset, setError } = useRunAction();
  const [buildingName, setBuildingName] = useState("Main building");
  const [buildingCode, setBuildingCode] = useState("");
  const [rooms, setRooms] = useState("2");
  const [shelves, setShelves] = useState("4");
  const [parentId, setParentId] = useState("");
  const roomCount = whole(rooms);
  const shelfCount = whole(shelves);
  const valid = Number.isInteger(roomCount) && Number.isInteger(shelfCount);
  const code = buildingCode.trim().toUpperCase() || "B1";
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const submit = () => {
    if (!valid || roomCount < 1) return setError("Enter how many rooms and shelves, as whole numbers.");
    run(() => buildLocationsAction(slug, { buildingName, buildingCode, rooms: roomCount, shelvesPerRoom: shelfCount, parentId }), (data) => `Added ${data?.count ?? 0} locations under ${data?.buildingCode ?? code}.`, () => onOpenChange(false));
  };
  return (
    <StockDialog open={open} onOpenChange={close} title="Quick builder" description="Add a building with its rooms and shelves in one go." submitLabel="Add locations" pending={pending} error={error} onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Building name" required>
          <Input value={buildingName} maxLength={80} onChange={(event) => setBuildingName(event.target.value)} />
        </Field>
        <Field label="Building code" optional helperText="Empty picks the next free B number.">
          <Input value={buildingCode} maxLength={12} autoCapitalize="characters" onChange={(event) => setBuildingCode(event.target.value.toUpperCase())} />
        </Field>
        <Field label="Rooms" required>
          <Input inputMode="numeric" value={rooms} onChange={(event) => setRooms(event.target.value)} />
        </Field>
        <Field label="Shelves in each room">
          <Input inputMode="numeric" value={shelves} onChange={(event) => setShelves(event.target.value)} />
        </Field>
      </div>
      <Field label="Inside">
        <Dropdown value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">Nothing (top level)</option>
          {parents.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </Dropdown>
      </Field>
      <p className="text-body-ui text-ink-muted" aria-live="polite">
        {valid && roomCount > 0
          ? `Creates 1 building, ${roomCount} ${roomCount === 1 ? "room" : "rooms"} and ${roomCount * shelfCount} ${roomCount * shelfCount === 1 ? "shelf" : "shelves"}: ${code}, ${code}-R1${shelfCount > 0 ? `, ${code}-R1-S1` : ""} and so on.`
          : "Enter whole numbers for rooms and shelves."}
      </p>
    </StockDialog>
  );
}
