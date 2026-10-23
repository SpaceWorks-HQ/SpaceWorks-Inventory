"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestLoanAction } from "@/app/actions/loans";
import { QuantityInput } from "@/components/desk/QuantityInput";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { setTrayQuantity, trayUnits, TRAY_MAX_QUANTITY, type TrayLine } from "@/lib/desk/borrowTray";

/** What the member is about to ask for, then purpose and date, then send. */
export function RequestTray({ slug, tray, names, onChange, blocked, minDate }: {
  slug: string; tray: TrayLine[]; names: Record<string, string>; onChange: (tray: TrayLine[]) => void; blocked: string | null; minDate: string;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState("");
  const [neededFrom, setNeededFrom] = useState("");
  const { run, pending, error } = useActionRunner();
  const units = trayUnits(tray);

  return (
    <Card as="section" aria-label="Your request" className="lg:sticky lg:top-6">
      <CardHeader title="Your request" description={tray.length ? `${units} ${units === 1 ? "item" : "items"}. Staff approve it, then you collect from the desk.` : "Add tools and parts, then send the request to the desk."} />
      {tray.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-body-ui text-ink-muted">Nothing added yet.</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => requestLoanAction(slug, { lines: tray, purpose, neededFrom }), "Request sent. You'll hear when it's ready.", (data) => {
              onChange([]);
              router.push(data ? `/s/${slug}/my-loans/${data.loanId}` : `/s/${slug}/my-loans`);
            });
          }}
        >
          <ul className="flex flex-col divide-y divide-line">
            {tray.map((line) => (
              <li key={line.itemId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 text-body-ui text-ink">{names[line.itemId] ?? "Item"}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <QuantityInput label={`Quantity of ${names[line.itemId] ?? "item"}`} value={line.quantity} min={0} max={TRAY_MAX_QUANTITY} onChange={(value) => onChange(setTrayQuantity(tray, line.itemId, value))} className="w-16" />
                  <Button variant="dangerQuiet" size="sm" onClick={() => onChange(setTrayQuantity(tray, line.itemId, 0))} aria-label={`Remove ${names[line.itemId] ?? "item"}`}>Remove</Button>
                </span>
              </li>
            ))}
          </ul>
          <Field label="What is it for?" optional>
            <Textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={500} rows={2} placeholder="e.g. Drilling shelf brackets for the community garden" />
          </Field>
          <Field label="Needed from" optional helperText="Leave blank to collect as soon as it's approved.">
            <Input type="date" value={neededFrom} min={minDate} onChange={(event) => setNeededFrom(event.target.value)} />
          </Field>
          {blocked ? <p className="text-caption text-ink-muted">Sending is paused until you can borrow again (see the note above).</p> : null}
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <Button type="submit" variant="primary" fullWidth loading={pending} disabled={Boolean(blocked)}>Send request</Button>
          <Button variant="quiet" onClick={() => onChange([])} disabled={pending}>Empty the request</Button>
        </form>
      )}
    </Card>
  );
}
