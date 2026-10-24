"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { completeSetup } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input, PasswordInput, PrefixInput } from "@/components/ui/field";
import { slugify } from "@/lib/slug";

export function SetupForm({ defaultTimeZone }: { defaultTimeZone: string }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", spaceName: "", spaceSlug: "", currency: "INR" });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === "spaceName" && !slugEdited ? { spaceSlug: slugify(value, "") } : {}),
    }));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTimeZone;
      const result = await completeSetup({ ...form, timezone });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      const signedIn = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      router.push(signedIn && !signedIn.error ? `/s/${result.data!.spaceSlug}/setup` : "/login");
      router.refresh();
    } catch {
      setError("Couldn't finish setup. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <p className="text-overline text-ink-muted">Your account</p>
      <Field label="Your name" required error={fieldErrors.name?.[0]}>
        <Input value={form.name} onChange={update("name")} autoComplete="name" maxLength={80} />
      </Field>
      <Field label="Email" required error={fieldErrors.email?.[0]}>
        <Input type="email" value={form.email} onChange={update("email")} autoComplete="email" />
      </Field>
      <Field label="Password" required helperText="At least 12 characters." error={fieldErrors.password?.[0]}>
        <PasswordInput value={form.password} onChange={update("password")} autoComplete="new-password" minLength={12} maxLength={128} />
      </Field>
      <p className="mt-2 text-overline text-ink-muted">Your first makerspace</p>
      <Field label="Space name" required helperText="The makerspace's name, e.g. TinkerSpace Kochi. You can add more spaces later." error={fieldErrors.spaceName?.[0]}>
        <Input value={form.spaceName} onChange={update("spaceName")} maxLength={80} />
      </Field>
      <Field label="Space address" required error={fieldErrors.spaceSlug?.[0]}>
        <PrefixInput
          prefix="/s/"
          value={form.spaceSlug}
          onChange={(event) => {
            setSlugEdited(true);
            setForm((current) => ({ ...current, spaceSlug: event.target.value.toLowerCase() }));
          }}
          maxLength={60}
        />
      </Field>
      <Field label="Currency" required helperText="Used for stock value, deposits and fees." error={fieldErrors.currency?.[0]}>
        <Dropdown value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}>
          {["INR", "USD", "EUR", "GBP", "AUD", "CAD", "SGD", "AED", "JPY"].map((code) => <option key={code} value={code}>{code}</option>)}
        </Dropdown>
      </Field>
      <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-1">Create space and continue</Button>
    </form>
  );
}
