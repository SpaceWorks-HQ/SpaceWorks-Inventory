"use client";

import { useState } from "react";
import type { AssetStatus } from "@prisma/client";
import { Ellipsis } from "lucide-react";
import { changeAssetStateAction, moveAssetAction } from "@/app/actions/stock";
import { StockDialog } from "@/components/stock/StockDialog";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Dropdown, Field, Textarea } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { AssetDetailsDialog, type AssetDetails } from "./AssetDetailsDialog";
import { useRunAction } from "./useRunAction";

type Open = null | "move" | "found" | "maintenance" | "repair" | "retire" | "details";
const CONFIRM = {
  maintenance: { title: "Send for repair?", message: "It stays on its shelf but can't be lent or moved out until it is repaired.", label: "Send for repair", done: "Sent for repair." },
  repair: { title: "Mark as repaired?", message: "It becomes available again, in good condition.", label: "Mark repaired", done: "Marked as repaired." },
  retire: { title: "Retire this asset?", message: "It leaves the books for good. Its history stays.", label: "Retire asset", done: "Retired the asset." },
} as const;

/** What can happen to one asset in its current state. */
export function AssetActions({ slug, assetId, status, canAdjust, canEdit, locations, currentLocationId, details, labelHref }: {
  slug: string; assetId: string; status: AssetStatus; canAdjust: boolean; canEdit: boolean; locations: Array<{ id: string; label: string }>;
  currentLocationId: string | null; details: AssetDetails; labelHref: string;
}) {
  const [open, setOpen] = useState<Open>(null);
  const runner = useRunAction();
  const [locationId, setLocationId] = useState("");
  const [note, setNote] = useState("");
  const onShelf = status === "AVAILABLE" || status === "MAINTENANCE";
  const targets = locations.filter((option) => open !== "move" || option.id !== currentLocationId);
  const chosen = targets.some((option) => option.id === locationId) ? locationId : (targets[0]?.id ?? "");
  const close = () => {
    runner.reset();
    setNote("");
    setOpen(null);
  };
  const confirm = open === "maintenance" || open === "repair" || open === "retire" ? CONFIRM[open] : null;

  return (
    <>
      {canAdjust && status === "MAINTENANCE" ? <Button variant="primary" onClick={() => setOpen("repair")}>Mark repaired</Button> : null}
      {canAdjust && status === "LOST" ? <Button variant="primary" onClick={() => setOpen("found")}>Mark found</Button> : null}
      {canAdjust && status === "AVAILABLE" ? <Button variant="secondary" onClick={() => setOpen("move")}>Move</Button> : null}
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More actions" variant="secondary"><Ellipsis aria-hidden /></IconButton>
        </MenuTrigger>
        <MenuContent>
          {canAdjust && status === "MAINTENANCE" ? <MenuItem onSelect={() => setOpen("move")}>Move…</MenuItem> : null}
          {canAdjust && status === "AVAILABLE" ? <MenuItem onSelect={() => setOpen("maintenance")}>Send for repair…</MenuItem> : null}
          {canEdit && status !== "ON_LOAN" && status !== "IN_TRANSIT" ? <MenuItem onSelect={() => setOpen("details")}>Edit details…</MenuItem> : null}
          <MenuItem asChild><a href={labelHref} target="_blank" rel="noopener">Print label</a></MenuItem>
          {canAdjust && (onShelf || status === "LOST") ? (
            <>
              <MenuSeparator />
              <MenuItem danger onSelect={() => setOpen("retire")}>Retire…</MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      <StockDialog
        open={open === "move" || open === "found"}
        onOpenChange={(next) => !next && close()}
        title={open === "found" ? "Mark as found" : "Move asset"}
        description={open === "found" ? "Put it back on the shelf where it turned up." : "Under-repair assets stay under repair at the new shelf."}
        submitLabel={open === "found" ? "Mark found" : "Move asset"}
        pending={runner.pending}
        error={runner.error}
        onSubmit={() => runner.run(
          () => (open === "found" ? changeAssetStateAction(slug, { assetId, action: "found", locationId: chosen, note }) : moveAssetAction(slug, { assetId, toLocationId: chosen, note })),
          open === "found" ? "Back on the shelf." : "Moved the asset.",
          close,
        )}
      >
        <Field label={open === "found" ? "Found at" : "Move to"}>
          <Dropdown value={chosen} onChange={(event) => setLocationId(event.target.value)}>
            {targets.length === 0 ? <option value="" disabled>Add a location first</option> : null}
            {targets.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Note" optional>
          <Textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </StockDialog>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message}
        confirmLabel={confirm?.label ?? "Confirm"}
        destructive={open === "retire"}
        loading={runner.pending}
        onCancel={close}
        onConfirm={() => confirm && open && open !== "details" && open !== "move" && open !== "found" && runner.run(() => changeAssetStateAction(slug, { assetId, action: open, note }), confirm.done, close)}
      >
        {runner.error ? <p role="alert" className="text-body-ui text-danger-fg">{runner.error}</p> : null}
      </ConfirmDialog>
      {canEdit ? <AssetDetailsDialog open={open === "details"} onOpenChange={(next) => (next ? setOpen("details") : setOpen(null))} slug={slug} assetId={assetId} initial={details} /> : null}
    </>
  );
}
