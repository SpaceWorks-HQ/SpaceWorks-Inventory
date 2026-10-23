"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createApiKeyAction } from "@/app/actions/integrations";
import { Button } from "@/components/ui/button";
import { CheckboxCard } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { API_SCOPES } from "@/lib/apiTokens/scopes";
import { SecretDialog } from "./SecretDialog";

const EXPIRY = [
  { value: "90", label: "In 90 days" },
  { value: "30", label: "In 30 days" },
  { value: "365", label: "In a year" },
  { value: "never", label: "Never" },
];

export function CreateApiKeyDialog({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:catalogue", "read:stock"]);
  const [expiry, setExpiry] = useState("90");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setName("");
    setScopes(["read:catalogue", "read:stock"]);
    setExpiry("90");
    setErrors({});
    setFormError(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
        <DialogTrigger asChild>
          <Button variant="secondary" startIcon={<Plus />}>New API key</Button>
        </DialogTrigger>
        <DialogContent size="md">
          <DialogHeader title="New API key" description="The key acts for you, within these scopes. It stops working if you stop being an admin of this space." />
          <form
            id="create-api-key"
            onSubmit={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await createApiKeyAction(slug, { name, scopes, expiresInDays: expiry === "never" ? null : Number(expiry) });
                if (!result.ok) {
                  setErrors(result.fieldErrors ?? {});
                  setFormError(result.fieldErrors ? null : result.error);
                  return;
                }
                setOpen(false);
                reset();
                setToken(result.data?.token ?? null);
                router.refresh();
              });
            }}
          >
            <DialogBody className="flex flex-col gap-4">
              <Field label="Name" helperText="Name it after what uses it, such as “Shop till sync”." error={errors.name?.[0]}>
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" required />
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-label text-ink">Scopes</legend>
                {errors.scopes?.[0] ? <p className="text-caption text-danger-fg">{errors.scopes[0]}</p> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  {API_SCOPES.map((scope) => (
                    <CheckboxCard
                      key={scope.value}
                      label={scope.label}
                      description={scope.description}
                      checked={scopes.includes(scope.value)}
                      onCheckedChange={(checked) => setScopes((current) => (checked === true ? [...current, scope.value] : current.filter((value) => value !== scope.value)))}
                    />
                  ))}
                </div>
              </fieldset>
              <Field label="Expires">
                <Dropdown value={expiry} onChange={(event) => setExpiry(event.target.value)}>
                  {EXPIRY.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Dropdown>
              </Field>
              {formError ? <p role="alert" className="text-caption text-danger-fg">{formError}</p> : null}
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" variant="primary" loading={pending}>Create key</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <SecretDialog
        title="Your new API key"
        description="Send it as “Authorization: Bearer <key>” to /api/v1."
        secret={token}
        onClose={() => setToken(null)}
      />
    </>
  );
}
