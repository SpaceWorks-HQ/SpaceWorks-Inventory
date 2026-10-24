"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { selfCheckoutAction } from "@/app/actions/loans";
import { handoverFormData } from "@/components/desk/handoverForm";
import { PhotoCapture } from "@/components/desk/PhotoCapture";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { Scanner } from "@/components/desk/Scanner";
import { DeskStepper } from "@/components/desk/DeskStepper";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { evidenceHint, withDone } from "@/lib/desk/stepper";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { resolveSelfCheckoutScanAction } from "@/app/actions/scan";
import { Field, Textarea } from "@/components/ui/field";

export type SelfCheckoutItem = { itemId: string; name: string; code: string; tracking: "QUANTITY" | "SERIALIZED"; assets: { code: string; label: string }[] };

/** Take items without the desk: scan each label, set how many, photograph, confirm. */
export function SelfCheckoutForm({ slug, items, unavailable, minPhotos, blocked }: { slug: string; items: SelfCheckoutItem[]; unavailable: Record<string, string>; minPhotos: number; blocked: string | null }) {
  const router = useRouter();
  const [codes, setCodes] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [remarks, setRemarks] = useState("");
  const { run, pending, error } = useActionRunner();
  // Codes the server resolved on demand (the page preloads at most 300 items and 100 tags each).
  const [extra, setExtra] = useState<{ items: SelfCheckoutItem[]; unavailable: Record<string, string> }>({ items: [], unavailable: {} });
  const allItems = useMemo(() => {
    const merged = new Map(items.map((item) => [item.itemId, item]));
    for (const item of extra.items) {
      const known = merged.get(item.itemId);
      merged.set(item.itemId, known ? { ...known, assets: [...known.assets, ...item.assets.filter((asset) => !known.assets.some((a) => a.code === asset.code))] } : item);
    }
    return [...merged.values()];
  }, [items, extra.items]);
  const allUnavailable = { ...unavailable, ...extra.unavailable };
  const resolve = async (code: string) => {
    const result = await resolveSelfCheckoutScanAction(slug, { code });
    const scan = result.ok ? result.data : null;
    if (!scan) return null;
    setExtra((current) => scan.unavailable
      ? { ...current, unavailable: { ...current.unavailable, [code]: scan.label } }
      : { ...current, items: [...current.items, { itemId: scan.itemId, name: scan.itemName, code: scan.kind === "item" ? code : "", tracking: scan.tracking, assets: scan.kind === "asset" ? [{ code, label: scan.label }] : [] }] });
    return { label: scan.label, unavailable: scan.unavailable };
  };
  const known = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of allItems) {
      if (item.tracking === "QUANTITY") map[item.code] = item.name;
      for (const asset of item.assets) map[asset.code] = asset.label;
    }
    return map;
  }, [allItems]);
  const quantityItems = allItems.filter((item) => item.tracking === "QUANTITY" && codes.includes(item.code));
  const paymentBlocked = codes.some((code) => Boolean(allUnavailable[code]));
  const scansComplete = !paymentBlocked && codes.length > 0;
  const completed = [scansComplete, scansComplete && quantityItems.every((item) => (quantities[item.itemId] ?? 1) > 0), photos.length >= Math.max(1, minPhotos)];
  const ready = completed.every(Boolean) && !blocked;

  const linesReady = completed[1]!;
  const submit = () => {
    const chosen = Object.fromEntries(quantityItems.map((item) => [item.itemId, quantities[item.itemId] ?? 1]));
    void run(() => selfCheckoutAction(slug, handoverFormData({ scannedCodes: codes, quantities: chosen, remarks }, photos)), "Checked out. Bring it back by the due date.", (data) => {
      router.push(data ? withDone(`/s/${slug}/my-loans/${data.loanId}`, "self-checkout") : `/s/${slug}/my-loans`);
    });
  };

  return (
    <DeskStepper
      label="Self-checkout"
      title="Check out"
      description="Scan the label on each tool (the asset tag) or the shelf label of a part. Only items marked for self-checkout can be taken."
      notice={blocked ? <Callout tone="warning" title="You can't borrow right now">{blocked}</Callout> : null}
      error={error}
      steps={[
        {
          title: "Scan",
          ready: scansComplete,
          hint: paymentBlocked ? "Remove items with a deposit or fee and borrow them at the desk." : "Scan what you're taking.",
          content: <Scanner codes={codes} onChange={setCodes} known={known} unavailable={allUnavailable} resolve={resolve} title="What you're taking" helper="Items with a deposit or fee need the desk when pay later is switched off." />,
        },
        {
          title: "Check the lines",
          ready: linesReady,
          hint: "Take at least one of each part you scanned.",
          content: quantityItems.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-panel" aria-label="How many">
              {quantityItems.map((item) => (
                <li key={item.itemId} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="text-body-ui text-ink">{item.name}</span>
                  <QuantityInput label={`How many ${item.name}`} value={quantities[item.itemId] ?? 1} min={1} max={20} onChange={(value) => setQuantities((q) => ({ ...q, [item.itemId]: value }))} className="w-20" />
                </li>
              ))}
            </ul>
          ) : <p className="text-body-ui text-ink-secondary">One unit per scanned asset tag.</p>,
        },
        {
          title: "Photos and remarks",
          ready: completed[2]!,
          hint: evidenceHint(minPhotos, false),
          content: (
            <>
              <PhotoCapture files={photos} onChange={setPhotos} min={minPhotos} />
              <Field label="Remarks" optional>
                <Textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={1000} rows={2} />
              </Field>
            </>
          ),
        },
      ]}
      finishHint={blocked}
      finish={<Button variant="primary" size="lg" loading={pending} disabled={!ready} onClick={submit}>Check out</Button>}
    />
  );
}
