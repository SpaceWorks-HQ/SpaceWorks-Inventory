"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Ellipsis } from "lucide-react";
import { setItemArchivedAction } from "@/app/actions/catalogue";
import { AdjustDialog, MoveDialog, ReceiveDialog } from "@/components/stock/QuantityDialogs";
import { QuarantineDialog, ResolveRepairDialog } from "@/components/stock/RepairDialogs";
import type { LevelOption, LocationOption } from "@/components/stock/StockDialog";
import { Button, IconButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useRunAction } from "./useRunAction";

type Open = null | "receive" | "adjust" | "move" | "quarantine" | "resolve" | "archive";

/** The item page's actions: receive (or add assets), edit and the stock menu. Hidden for staff who can only look. */
export function ItemDetailActions({ slug, itemId, tracking, archived, canEdit, canAdjust, unit, currency, minorDigits, locations, levels }: {
  slug: string; itemId: string; tracking: "QUANTITY" | "SERIALIZED"; archived: boolean; canEdit: boolean; canAdjust: boolean;
  unit: string | null; currency: string; minorDigits: number; locations: LocationOption[]; levels: LevelOption[];
}) {
  const [open, setOpen] = useState<Open>(null);
  const archive = useRunAction();
  const quantity = tracking === "QUANTITY";
  const dialog = (name: Exclude<Open, null>) => ({ open: open === name, onOpenChange: (next: boolean) => setOpen(next ? name : null) });
  const shared = { slug, itemId, unit };
  const labelHref = `/s/${slug}/labels/print?kind=items&ids=${encodeURIComponent(itemId)}`;
  const hasRepairs = levels.some((level) => level.quarantined > 0);

  return (
    <>
      {canAdjust && !archived && quantity ? <Button variant="primary" onClick={() => setOpen("receive")}>Receive stock</Button> : null}
      {canEdit && !archived && !quantity ? <Button asChild variant="primary"><a href="#add-assets">Add assets</a></Button> : null}
      {canEdit ? <Button asChild variant="secondary"><Link href={`/s/${slug}/items/${itemId}/edit`}>Edit</Link></Button> : null}
      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More actions" variant="secondary"><Ellipsis aria-hidden /></IconButton>
        </MenuTrigger>
        <MenuContent>
          {canAdjust && quantity && !archived ? (
            <>
              <MenuItem onSelect={() => setOpen("adjust")}>Adjust stock…</MenuItem>
              <MenuItem onSelect={() => setOpen("move")}>Move stock…</MenuItem>
              <MenuItem onSelect={() => setOpen("quarantine")}>Put on repair shelf…</MenuItem>
              {hasRepairs ? <MenuItem onSelect={() => setOpen("resolve")}>Take off repair shelf…</MenuItem> : null}
              <MenuSeparator />
            </>
          ) : null}
          <MenuItem asChild><a href={labelHref} target="_blank" rel="noopener">Print label</a></MenuItem>
          <MenuItem asChild><Link href={`/s/${slug}/stock/movements?item=${encodeURIComponent(itemId)}`}>Stock ledger</Link></MenuItem>
          {canEdit ? (
            <>
              <MenuSeparator />
              <MenuItem icon={<Archive />} danger={!archived} onSelect={() => setOpen("archive")}>{archived ? "Restore item" : "Archive item…"}</MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      {canAdjust && quantity ? (
        <>
          <ReceiveDialog {...dialog("receive")} {...shared} locations={locations} currency={currency} minorDigits={minorDigits} />
          <AdjustDialog {...dialog("adjust")} {...shared} levels={levels} locations={locations} />
          <MoveDialog {...dialog("move")} {...shared} levels={levels} locations={locations} />
          <QuarantineDialog {...dialog("quarantine")} {...shared} levels={levels} />
          <ResolveRepairDialog {...dialog("resolve")} {...shared} levels={levels} />
        </>
      ) : null}
      <ConfirmDialog
        open={open === "archive"}
        title={archived ? "Restore this item?" : "Archive this item?"}
        message={archived ? "It comes back to the catalogue and pickers." : "It leaves the catalogue and pickers; its history stays. Stock must be zero and nothing out on loan."}
        confirmLabel={archived ? "Restore item" : "Archive item"}
        destructive={!archived}
        loading={archive.pending}
        onCancel={() => {
          archive.reset();
          setOpen(null);
        }}
        onConfirm={() => archive.run(() => setItemArchivedAction(slug, { id: itemId, archived: !archived }), archived ? "Restored the item." : "Archived the item.", () => setOpen(null))}
      >
        {archive.error ? <p role="alert" className="text-body-ui text-danger-fg">{archive.error}</p> : null}
      </ConfirmDialog>
    </>
  );
}
