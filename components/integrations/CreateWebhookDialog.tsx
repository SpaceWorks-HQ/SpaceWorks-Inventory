"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createWebhookAction } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { CheckboxField, Radio, RadioGroup } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { EVENT_TYPES } from "@/lib/events/catalogue";
import { SecretDialog } from "./SecretDialog";

export function CreateWebhookDialog({ slug, disabled }: { slug: string; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"all" | "some">("all");
  const [events, setEvents] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setUrl("");
    setDescription("");
    setScope("all");
    setEvents([]);
    setErrors({});
    setFormError(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogTrigger asChild>
          <Button variant="secondary" startIcon={<Plus />} disabled={disabled}>Add webhook</Button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader title="Add webhook" description="Space Works posts a signed JSON event to this address whenever something you pick happens." />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await createWebhookAction(slug, { url, description, events: scope === "all" ? ["*"] : events });
                if (!result.ok) {
                  setErrors(result.fieldErrors ?? {});
                  setFormError(result.fieldErrors ? null : result.error);
                  return;
                }
                setOpen(false);
                reset();
                setSecret(result.data?.secret ?? null);
                router.refresh();
              });
            }}
          >
            <DialogBody className="flex flex-col gap-4">
              <Field label="URL" helperText="A public https:// address. Private network addresses are refused." error={errors.url?.[0]}>
                <Input type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.org/hooks/space-works" autoComplete="off" required />
              </Field>
              <Field label="Description" optional error={errors.description?.[0]}>
                <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={120} placeholder="Stock sync to the shop till" />
              </Field>
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-label text-ink">Events</legend>
                <RadioGroup value={scope} onValueChange={(value) => setScope(value as "all" | "some")} aria-label="Which events to send">
                  <Radio value="all" label="All events" description="Including event types added in later versions." />
                  <Radio value="some" label="Only the events I pick" />
                </RadioGroup>
                {scope === "some" ? (
                  <div className="mt-2 grid gap-x-4 sm:grid-cols-2">
                    {EVENT_TYPES.map((entry) => (
                      <CheckboxField
                        key={entry.type}
                        label={entry.label}
                        description={entry.type}
                        checked={events.includes(entry.type)}
                        onCheckedChange={(checked) => setEvents((current) => (checked === true ? [...current, entry.type] : current.filter((value) => value !== entry.type)))}
                      />
                    ))}
                  </div>
                ) : null}
                {errors.events?.[0] ? <p className="text-caption text-danger-fg">{errors.events[0]}</p> : null}
              </fieldset>
              {formError ? <p role="alert" className="text-caption text-danger-fg">{formError}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="primary" loading={pending}>Add webhook</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SecretDialog
        title="Signing secret"
        description="Use it to check the X-SpaceWorks-Signature header on every event."
        secret={secret}
        onClose={() => setSecret(null)}
      />
    </>
  );
}
