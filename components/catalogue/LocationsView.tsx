"use client";

import { useState } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { setLocationArchivedAction } from "@/app/actions/catalogue";
import { Button, IconButton } from "@/components/ui/button";
import { Chip, EmptyState, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { LocationBuilder } from "./LocationBuilder";
import { LocationDialog, type LocationValues, type ParentOption } from "./LocationDialog";
import { QrDialog, type QrTarget } from "./QrDialog";
import { useRunAction } from "./useRunAction";
import { LOCATION_KIND_LABEL } from "./words";

export type LocationRow = LocationValues & { id: string; depth: number; archived: boolean; itemLines: number; units: number };

const EMPTY: LocationValues = { name: "", code: "", kind: "SHELF", parentId: "", description: "" };

/** The location tree with counts, QR codes and (for managers) editing, archiving and the quick builder. */
export function LocationsView({ slug, rows, parents, canEdit, showArchived }: { slug: string; rows: LocationRow[]; parents: ParentOption[]; canEdit: boolean; showArchived: boolean }) {
  const [editing, setEditing] = useState<LocationRow | "new" | null>(null);
  const [building, setBuilding] = useState(false);
  const [qr, setQr] = useState<QrTarget | null>(null);
  const [archiving, setArchiving] = useState<LocationRow | null>(null);
  const runner = useRunAction();
  const printHref = (id: string) => `/s/${slug}/labels/print?kind=locations&ids=${encodeURIComponent(id)}`;

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Locations"
        description="Buildings, rooms, shelves and bins. Each has a short code and a QR label."
        actions={
          <>
            <Button asChild variant="secondary"><Link href={showArchived ? `/s/${slug}/locations` : `/s/${slug}/locations?archived=1`}>{showArchived ? "Hide archived" : "Show archived"}</Link></Button>
            {canEdit ? <Button variant="secondary" onClick={() => setBuilding(true)}>Quick builder</Button> : null}
            {canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>Add location</Button> : null}
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState patch title="No locations yet." action={canEdit ? <Button variant="primary" onClick={() => setBuilding(true)}>Use the quick builder</Button> : undefined}>
          Add a building with its rooms and shelves in one go.
        </EmptyState>
      ) : (
        <Table label="Locations">
          <THead>
            <tr><TH>Name</TH><TH>Kind</TH><TH>Code</TH><TH className="text-right">Item lines</TH><TH className="text-right">Units</TH><TH><span className="sr-only">Actions</span></TH></tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD className="min-w-48">
                  <span className="inline-flex items-center gap-2" style={{ paddingLeft: `${Math.min(row.depth, 8) * 20}px` }}>
                    {row.depth > 0 ? <span aria-hidden className="text-ink-muted">└</span> : null}
                    <span className="font-semibold">{row.name}</span>
                    {row.archived ? <Chip size="sm" tone="outline">Archived</Chip> : null}
                  </span>
                </TD>
                <TD className="text-ink-muted">{LOCATION_KIND_LABEL[row.kind]}</TD>
                <TD className="tabular-nums">{row.code}</TD>
                <TD className="text-right">{row.itemLines}</TD>
                <TD className="text-right">{row.units}</TD>
                <TD className="w-12 text-right">
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton label={`Actions for ${row.name}`}><Ellipsis aria-hidden /></IconButton>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem onSelect={() => setQr({ kind: "location", id: row.id, title: `${row.name} (${row.code})`, printHref: printHref(row.id) })}>Show QR code</MenuItem>
                      <MenuItem asChild><a href={printHref(row.id)} target="_blank" rel="noopener">Print label</a></MenuItem>
                      <MenuItem asChild><Link href={`/s/${slug}/stock?location=${encodeURIComponent(row.id)}`}>Stock here</Link></MenuItem>
                      {canEdit ? (
                        <>
                          {!row.archived ? <MenuItem onSelect={() => setEditing(row)}>Edit…</MenuItem> : null}
                          <MenuSeparator />
                          <MenuItem danger={!row.archived} onSelect={() => setArchiving(row)}>{row.archived ? "Restore…" : "Archive…"}</MenuItem>
                        </>
                      ) : null}
                    </MenuContent>
                  </Menu>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {canEdit && editing ? (
        <LocationDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          slug={slug}
          locationId={editing === "new" ? null : editing.id}
          initial={editing === "new" ? EMPTY : { name: editing.name, code: editing.code, kind: editing.kind, parentId: editing.parentId, description: editing.description }}
          parents={parents}
        />
      ) : null}
      {canEdit ? <LocationBuilder open={building} onOpenChange={setBuilding} slug={slug} parents={parents} /> : null}
      <QrDialog slug={slug} target={qr} onClose={() => setQr(null)} />
      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? `Restore ${archiving.name}?` : `Archive ${archiving?.name ?? "this location"}?`}
        message={archiving?.archived ? "It comes back to pickers and counts." : "It leaves pickers. It must be empty, with nothing active inside it."}
        confirmLabel={archiving?.archived ? "Restore" : "Archive"}
        destructive={!archiving?.archived}
        loading={runner.pending}
        onCancel={() => {
          runner.reset();
          setArchiving(null);
        }}
        onConfirm={() => archiving && runner.run(() => setLocationArchivedAction(slug, { id: archiving.id, archived: !archiving.archived }), archiving.archived ? "Restored the location." : "Archived the location.", () => setArchiving(null))}
      >
        {runner.error ? <p role="alert" className="text-body-ui text-danger-fg">{runner.error}</p> : null}
      </ConfirmDialog>
    </div>
  );
}
