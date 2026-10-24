"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUnitAction, saveUnitAction } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Card, CardHeader, EmptyState } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/feedback/ToastProvider";

export type UnitRow = { id: string; name: string; symbol: string; items: number };

function fieldErrors(result: { fieldErrors?: Record<string, string[]> }) {
  return Object.fromEntries(Object.entries(result.fieldErrors ?? {}).map(([key, list]) => [key, list[0] ?? ""]));
}

/** Units items are counted in (pieces, metres, grams). A unit in use can't be deleted. */
export function UnitsPanel({ slug, units }: { slug: string; units: UnitRow[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [draft, setDraft] = useState({ name: "", symbol: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [deleting, setDeleting] = useState<UnitRow | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (id: string | null, values: { name: string; symbol: string }, done: () => void) =>
    startTransition(async () => {
      const result = await saveUnitAction(slug, { id, values });
      if (!result.ok) {
        setErrors(fieldErrors(result));
        showToast(result.error, "error");
        return;
      }
      setErrors({});
      showToast(id ? "Unit saved." : "Unit added.", "success");
      done();
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Add a unit" description="How an item is counted, e.g. Piece (pcs), Metre (m) or Roll (roll)." />
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            save(null, draft, () => setDraft({ name: "", symbol: "" }));
          }}
        >
          <Field label="Name" error={editing ? undefined : errors.name}>
            <Input value={draft.name} maxLength={30} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </Field>
          <Field label="Symbol" error={editing ? undefined : errors.symbol}>
            <Input value={draft.symbol} maxLength={10} onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))} />
          </Field>
          <Button type="submit" variant="primary" loading={pending && !editing}>Add unit</Button>
        </form>
      </Card>
      {units.length === 0 ? (
        <EmptyState title="No units yet.">Add the units your items are counted in.</EmptyState>
      ) : (
        <Table label="Units">
          <THead><tr><TH>Unit</TH><TH>Symbol</TH><TH>Items</TH><TH><span className="sr-only">Actions</span></TH></tr></THead>
          <TBody>
            {units.map((unit) => (
              <TR key={unit.id}>
                <TD className="font-semibold">{unit.name}</TD>
                <TD>{unit.symbol}</TD>
                <TD className="tabular-nums">{unit.items}</TD>
                <TD className="whitespace-nowrap text-right">
                  <span className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" aria-label={`Edit ${unit.name}`} onClick={() => { setErrors({}); setEditing(unit); }}>Edit</Button>
                    <Button size="sm" variant="dangerQuiet" aria-label={`Delete ${unit.name}`} disabled={unit.items > 0} onClick={() => setDeleting(unit)}>Delete</Button>
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      {editing ? <EditUnit key={editing.id} unit={editing} errors={errors} pending={pending} onClose={() => setEditing(null)} onSave={(values) => save(editing.id, values, () => setEditing(null))} /> : null}
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? "this unit"}?`}
        message="Items can no longer be counted in this unit."
        confirmLabel="Delete unit"
        loading={pending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting;
          if (!target) return;
          startTransition(async () => {
            const result = await deleteUnitAction(slug, { id: target.id });
            setDeleting(null);
            if (!result.ok) showToast(result.error, "error");
            else {
              showToast("Unit deleted.", "success");
              router.refresh();
            }
          });
        }}
      />
    </div>
  );
}

function EditUnit({ unit, errors, pending, onClose, onSave }: { unit: UnitRow; errors: Record<string, string>; pending: boolean; onClose: () => void; onSave: (values: { name: string; symbol: string }) => void }) {
  const [values, setValues] = useState({ name: unit.name, symbol: unit.symbol });
  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent>
        <DialogHeader title={`Edit ${unit.name}`} />
        <DialogBody className="flex flex-col gap-4">
          <Field label="Name" error={errors.name}><Input value={values.name} maxLength={30} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} /></Field>
          <Field label="Symbol" error={errors.symbol}><Input value={values.symbol} maxLength={10} onChange={(e) => setValues((v) => ({ ...v, symbol: e.target.value }))} /></Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={() => onSave(values)}>Save unit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
