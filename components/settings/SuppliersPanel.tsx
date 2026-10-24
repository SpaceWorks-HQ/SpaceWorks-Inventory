"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { saveSupplierAction, setSupplierArchivedAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Chip, EmptyState, SectionHeading } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";

export type SupplierRow = { id: string; name: string; email: string | null; phone: string | null; website: string | null; notes: string | null; items: number; archived: boolean };

type Draft = { name: string; email: string; phone: string; website: string; notes: string };

/** Where stock is bought. Archived suppliers drop out of pickers; their items keep the link. */
export function SuppliersPanel({ slug, suppliers }: { slug: string; suppliers: SupplierRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState<{ supplier: SupplierRow | null } | null>(null);
  const [pending, startTransition] = useTransition();

  const archive = (supplier: SupplierRow) =>
    startTransition(async () => {
      const result = await setSupplierArchivedAction(slug, { id: supplier.id, archived: !supplier.archived });
      if (!result.ok) showToast(result.error, "error");
      else {
        showToast(supplier.archived ? "Supplier restored." : "Supplier archived.", "success");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <SectionHeading
        title="Suppliers"
        description="Shops and vendors you buy from. Items and the to-buy list can name a supplier."
        action={<Button variant="primary" startIcon={<Plus />} onClick={() => setEditing({ supplier: null })}>Add supplier</Button>}
      />
      {suppliers.length === 0 ? (
        <EmptyState title="No suppliers yet.">Add the shops you buy tools and parts from.</EmptyState>
      ) : (
        <Table label="Suppliers">
          <THead><tr><TH>Supplier</TH><TH>Contact</TH><TH>Items</TH><TH>Status</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
          <TBody>
            {suppliers.map((supplier) => (
              <TR key={supplier.id}>
                <TD>
                  <span className="block font-semibold">{supplier.name}</span>
                  {supplier.website ? <a href={supplier.website} target="_blank" rel="noopener noreferrer" className="block truncate text-caption text-accent-text underline underline-offset-4">{supplier.website}</a> : null}
                </TD>
                <TD className="text-body-ui text-ink-secondary">{[supplier.email, supplier.phone].filter(Boolean).join(" · ") || "None"}</TD>
                <TD className="tabular-nums">{supplier.items}</TD>
                <TD>{supplier.archived ? <Chip tone="outline" size="sm">Archived</Chip> : <Chip tone="success" size="sm">Active</Chip>}</TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Edit ${supplier.name}`} onClick={() => setEditing({ supplier })}>Edit</Button>
                    <Button size="sm" variant="quiet" aria-label={`${supplier.archived ? "Restore" : "Archive"} ${supplier.name}`} disabled={pending} onClick={() => archive(supplier)}>{supplier.archived ? "Restore" : "Archive"}</Button>
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? <SupplierDialog key={editing.supplier?.id ?? "new"} slug={slug} supplier={editing.supplier} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SupplierDialog({ slug, supplier, onClose }: { slug: string; supplier: SupplierRow | null; onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft>({ name: supplier?.name ?? "", email: supplier?.email ?? "", phone: supplier?.phone ?? "", website: supplier?.website ?? "", notes: supplier?.notes ?? "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: event.target.value }));

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent size="md">
        <DialogHeader title={supplier ? `Edit ${supplier.name}` : "Add a supplier"} />
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name} className="sm:col-span-2"><Input value={draft.name} maxLength={80} onChange={set("name")} /></Field>
          <Field label="Email" optional error={errors.email}><Input type="email" value={draft.email} onChange={set("email")} /></Field>
          <Field label="Phone" optional error={errors.phone}><Input type="tel" value={draft.phone} maxLength={32} onChange={set("phone")} /></Field>
          <Field label="Website" optional error={errors.website} className="sm:col-span-2"><Input type="url" placeholder="https://" value={draft.website} onChange={set("website")} /></Field>
          <Field label="Notes" optional error={errors.notes} className="sm:col-span-2"><Textarea rows={3} maxLength={1000} value={draft.notes} onChange={set("notes")} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveSupplierAction(slug, { id: supplier?.id ?? null, values: draft });
                if (!result.ok) {
                  setErrors(Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, list]) => [key, list[0] ?? ""])));
                  showToast(result.error, "error");
                  return;
                }
                showToast(supplier ? "Supplier saved." : "Supplier added.", "success");
                onClose();
                router.refresh();
              })
            }
          >
            {supplier ? "Save supplier" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
