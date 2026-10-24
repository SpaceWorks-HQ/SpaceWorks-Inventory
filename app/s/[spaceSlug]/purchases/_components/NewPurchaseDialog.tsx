"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPurchaseAction } from "@/app/actions/purchases";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";

type Option = { id: string; name: string; sku?: string };

const EMPTY = { itemId: "", name: "", quantity: "1", supplierId: "", unitCost: "", link: "", note: "" };

/** Ask for something to be bought: a catalogue item or a free-text name for something new. */
export function NewPurchaseDialog({ slug, currency, items, suppliers }: { slug: string; currency: string; items: Option[]; suppliers: Option[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = () =>
    startTransition(async () => {
      const quantity = Number(form.quantity);
      const result = await createPurchaseAction(slug, { ...form, quantity: Number.isFinite(quantity) ? quantity : 0 });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        showToast(result.error, "error");
        return;
      }
      setErrors({});
      setForm(EMPTY);
      setOpen(false);
      showToast("Added to the buy list.", "success");
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="primary" startIcon={<Plus />} onClick={() => setOpen(true)}>Request a purchase</Button>
      <DialogContent size="md">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogHeader title="Request a purchase" description="Pick a catalogue item, or name something the space doesn't stock yet." />
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Catalogue item" optional className="sm:col-span-2" error={errors.itemId?.[0]}>
              <Dropdown value={form.itemId} onChange={set("itemId")}>
                <option value="">Something new</option>
                {items.map((item) => <option key={item.id} value={item.id}>{item.sku ? `${item.name} (${item.sku})` : item.name}</option>)}
              </Dropdown>
            </Field>
            {form.itemId ? null : (
              <Field label="What to buy" className="sm:col-span-2" error={errors.name?.[0]} helperText="The item is added to the catalogue when it arrives.">
                <Input value={form.name} onChange={set("name")} maxLength={120} required />
              </Field>
            )}
            <Field label="Quantity" error={errors.quantity?.[0]}>
              <Input type="number" inputMode="numeric" min={1} step={1} value={form.quantity} onChange={set("quantity")} required />
            </Field>
            <Field label={`Unit cost (${currency})`} optional error={errors.unitCost?.[0]}>
              <Input inputMode="decimal" value={form.unitCost} onChange={set("unitCost")} placeholder="0.00" />
            </Field>
            <Field label="Supplier" optional className="sm:col-span-2">
              <Dropdown value={form.supplierId} onChange={set("supplierId")}>
                <option value="">No supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
              </Dropdown>
            </Field>
            <Field label="Link" optional className="sm:col-span-2" error={errors.link?.[0]}>
              <Input type="url" value={form.link} onChange={set("link")} placeholder="https://" maxLength={500} />
            </Field>
            <Field label="Note" optional className="sm:col-span-2">
              <Textarea rows={3} value={form.note} onChange={set("note")} maxLength={1000} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>Add to buy list</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
