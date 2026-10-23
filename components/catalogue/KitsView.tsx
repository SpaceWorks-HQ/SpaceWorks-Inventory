"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { setContainerArchivedAction, setKitArchivedAction } from "@/app/actions/catalogue";
import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeader, Chip, EmptyState, PageHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ContainersDialog } from "./ContainersDialog";
import { KitDialog, type KitValues } from "./KitDialog";
import { QrDialog, type QrTarget } from "./QrDialog";
import { useRunAction } from "./useRunAction";

export type KitRow = { id: string; name: string; description: string; lendable: boolean; archived: boolean; lines: Array<{ itemId: string; item: string; quantity: number }> };
export type ContainerRow = { id: string; code: string; name: string | null; archived: boolean; loan: { id: string; ref: string } | null };
type Archiving = { kind: "kit" | "container"; id: string; label: string; archived: boolean };

const NEW_KIT: KitValues = { name: "", description: "", lendable: true, lines: [{ itemId: "", quantity: "1" }] };

function RowMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Menu>
      <MenuTrigger asChild><IconButton label={label}><Ellipsis aria-hidden /></IconButton></MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  );
}

/** Kits (bundles lent together) and containers (QR-labelled bags loans are packed into). */
export function KitsView({ slug, kits, containers, items, canEdit }: { slug: string; kits: KitRow[]; containers: ContainerRow[]; items: Array<{ id: string; label: string }>; canEdit: boolean }) {
  const [editing, setEditing] = useState<KitRow | "new" | null>(null);
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState<QrTarget | null>(null);
  const [archiving, setArchiving] = useState<Archiving | null>(null);
  const runner = useRunAction();
  const print = (kind: "kits" | "containers", id: string) => `/s/${slug}/labels/print?kind=${kind}&ids=${encodeURIComponent(id)}`;
  const archiveMenu = (target: Archiving) => (
    <>
      <MenuSeparator />
      <MenuItem danger={!target.archived} onSelect={() => setArchiving(target)}>{target.archived ? "Restore…" : "Archive…"}</MenuItem>
    </>
  );

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Kits and containers" description="Kits bundle items members borrow together. Containers are the labelled bags and boxes loans go out in." actions={canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>Add kit</Button> : undefined} />
      <Card>
        <CardHeader title="Kits" />
        {kits.length === 0 ? (
          <EmptyState className="border-0 p-0" title="No kits yet." action={canEdit ? <Button variant="secondary" onClick={() => setEditing("new")}>Add a kit</Button> : undefined} />
        ) : (
          <Table label="Kits">
            <THead><tr><TH>Kit</TH><TH>Items</TH><TH>Lending</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
            <TBody>
              {kits.map((kit) => (
                <TR key={kit.id}>
                  <TD className="min-w-40"><span className="font-semibold">{kit.name}</span>{kit.archived ? <Chip size="sm" tone="outline" className="ml-2">Archived</Chip> : null}{kit.description ? <span className="block text-caption text-ink-muted">{kit.description}</span> : null}</TD>
                  <TD className="min-w-56 text-ink-muted">{kit.lines.map((line) => `${line.quantity} × ${line.item}`).join(", ")}</TD>
                  <TD>{kit.lendable ? <Chip tone="accent">Lendable</Chip> : <Chip tone="outline">Not lendable</Chip>}</TD>
                  <TD className="w-12 text-right">
                    <RowMenu label={`Actions for ${kit.name}`}>
                      <MenuItem onSelect={() => setQr({ kind: "kit", id: kit.id, title: kit.name, printHref: print("kits", kit.id) })}>Show QR code</MenuItem>
                      <MenuItem asChild><a href={print("kits", kit.id)} target="_blank" rel="noopener">Print label</a></MenuItem>
                      {canEdit && !kit.archived ? <MenuItem onSelect={() => setEditing(kit)}>Edit…</MenuItem> : null}
                      {canEdit ? archiveMenu({ kind: "kit", id: kit.id, label: kit.name, archived: kit.archived }) : null}
                    </RowMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader
          title="Containers"
          description="Scanned at issue and at return; one loan at a time."
          action={
            <>
              {containers.length > 0 ? <Button asChild variant="ghost" size="sm"><Link href={`/s/${slug}/labels?kind=containers`}>Print labels</Link></Button> : null}
              {canEdit ? <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>Create containers</Button> : null}
            </>
          }
        />
        {containers.length === 0 ? (
          <p className="text-body-ui text-ink-muted">No containers yet.</p>
        ) : (
          <Table label="Containers">
            <THead><tr><TH>Code</TH><TH>Name</TH><TH>Current loan</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
            <TBody>
              {containers.map((box) => (
                <TR key={box.id}>
                  <TD className="font-semibold tabular-nums">{box.code}{box.archived ? <Chip size="sm" tone="outline" className="ml-2">Archived</Chip> : null}</TD>
                  <TD className="text-ink-muted">{box.name ?? "None"}</TD>
                  <TD>{box.loan ? <Link href={`/s/${slug}/loans/${box.loan.id}`} className="font-semibold tabular-nums text-accent-text hover:underline">{box.loan.ref}</Link> : <span className="text-ink-muted">Free</span>}</TD>
                  <TD className="w-12 text-right">
                    <RowMenu label={`Actions for ${box.code}`}>
                      <MenuItem onSelect={() => setQr({ kind: "container", id: box.id, title: box.code, printHref: print("containers", box.id) })}>Show QR code</MenuItem>
                      <MenuItem asChild><a href={print("containers", box.id)} target="_blank" rel="noopener">Print label</a></MenuItem>
                      {canEdit ? archiveMenu({ kind: "container", id: box.id, label: box.code, archived: box.archived }) : null}
                    </RowMenu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {canEdit && editing ? (
        <KitDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          slug={slug}
          kitId={editing === "new" ? null : editing.id}
          initial={editing === "new" ? NEW_KIT : { name: editing.name, description: editing.description, lendable: editing.lendable, lines: editing.lines.map((line) => ({ itemId: line.itemId, quantity: String(line.quantity) })) }}
          items={items}
        />
      ) : null}
      {canEdit ? <ContainersDialog open={creating} onOpenChange={setCreating} slug={slug} /> : null}
      <QrDialog slug={slug} target={qr} onClose={() => setQr(null)} />
      <ConfirmDialog
        open={archiving !== null}
        title={archiving?.archived ? `Restore ${archiving.label}?` : `Archive ${archiving?.label ?? ""}?`}
        message={archiving?.archived ? "It can be used for loans again." : "It can't be used for new loans. Its history stays."}
        confirmLabel={archiving?.archived ? "Restore" : "Archive"}
        destructive={!archiving?.archived}
        loading={runner.pending}
        onCancel={() => {
          runner.reset();
          setArchiving(null);
        }}
        onConfirm={() => {
          if (!archiving) return;
          const input = { id: archiving.id, archived: !archiving.archived };
          runner.run(() => (archiving.kind === "kit" ? setKitArchivedAction(slug, input) : setContainerArchivedAction(slug, input)), archiving.archived ? "Restored." : "Archived.", () => setArchiving(null));
        }}
      >
        {runner.error ? <p role="alert" className="text-body-ui text-danger-fg">{runner.error}</p> : null}
      </ConfirmDialog>
    </div>
  );
}
