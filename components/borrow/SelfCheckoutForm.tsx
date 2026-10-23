"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { selfCheckoutAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Scanner } from "@/components/desk/Scanner";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Textarea } from "@/components/ui/field";

export type SelfCheckoutItem = { itemId: string; name: string; code: string; tracking: "QUANTITY" | "SERIALIZED"; assets: { code: string; label: string }[] };

/** Take items without the desk: scan each label, set how many, photograph, confirm. */
export function SelfCheckoutForm({ slug, items, minPhotos, blocked }: { slug: string; items: SelfCheckoutItem[]; minPhotos: number; blocked: string | null }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.tracking === "QUANTITY") map[item.code] = item.name;
      for (const asset of item.assets) map[asset.code] = asset.label;
    }
    return map;
  }, [items]);
  const quantityItems = items.filter((item) => item.tracking === "QUANTITY" && codes.includes(item.code));
  const ready = codes.length > 0 && photos.length >= Math.max(1, minPhotos) && !blocked;

  return (
    <Card as="section" aria-label="Self-checkout">
      <CardHeader title="Check out" description="Scan the label on each tool (the asset tag) or the shelf label of a part. Only items marked for self-checkout can be taken." />
      <div className="flex flex-col gap-6">
        {blocked ? <Callout tone="warning" title="You can't borrow right now">{blocked}</Callout> : null}
        <Scanner codes={codes} onChange={setCodes} known={known} title="What you're taking" />
        {quantityItems.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-panel" aria-label="How many">
            {quantityItems.map((item) => (
              <li key={item.itemId} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="text-body-ui text-ink">{item.name}</span>
                <QuantityInput label={`How many ${item.name}`} value={quantities[item.itemId] ?? 1} min={1} max={20} onChange={(value) => setQuantities((q) => ({ ...q, [item.itemId]: value }))} className="w-20" />
              </li>
            ))}
          </ul>
        ) : null}
        <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
        <Field label="Remarks" optional>
          <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={2} />
        </Field>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Button
          variant="primary"
          size="lg"
          loading={pending}
          disabled={!ready}
          className="self-end"
          onClick={() => {
            const chosen = Object.fromEntries(quantityItems.map((item) => [item.itemId, quantities[item.itemId] ?? 1]));
            void run(() => selfCheckoutAction(slug, handoverFormData({ scannedCodes: codes, quantities: chosen, remarks }, photos)), "Checked out. Bring it back by the due date.", (data) => {
              router.push(data ? `/s/${slug}/my-loans/${data.loanId}` : `/s/${slug}/my-loans`);
            });
          }}
        >
          Check out
        </Button>
      </div>
    </Card>
  );
}
