"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { quickAddCategoryAction, quickAddUnitAction } from "@/app/actions/catalogue";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";

type Added = { id: string; label: string };

/** Add a category or unit without leaving the item form. */
export function QuickAddDialog({ slug, kind, onAdded }: { slug: string; kind: "category" | "unit"; onAdded: (option: Added) => void }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noun = kind === "category" ? "category" : "unit";

  const submit = () => {
    startTransition(async () => {
      if (kind === "category") {
        const result = await quickAddCategoryAction(slug, { name });
        if (!result.ok) return setError(result.error);
        onAdded({ id: result.data!.id, label: result.data!.name });
      } else {
        const result = await quickAddUnitAction(slug, { name, symbol });
        if (!result.ok) return setError(result.error);
        onAdded({ id: result.data!.id, label: `${result.data!.name} (${result.data!.symbol})` });
      }
      showToast(`Added the ${noun}.`, "success");
      setName("");
      setSymbol("");
      setError(null);
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" startIcon={<Plus />}>{`New ${noun}`}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader title={`New ${noun}`} description={kind === "category" ? "Lending overrides for the category can be set in inventory settings." : "For example Pieces (pcs), Metres (m) or Grams (g)."} />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }}
        >
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name" error={error ?? undefined} required>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={kind === "category" ? 60 : 30} autoFocus />
            </Field>
            {kind === "unit" ? (
              <Field label="Symbol" required>
                <Input value={symbol} onChange={(event) => setSymbol(event.target.value)} maxLength={10} />
              </Field>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending}>{`Add ${noun}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
