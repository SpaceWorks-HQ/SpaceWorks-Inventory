"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** Spends an emailed sign-in link on click, asking for the authenticator code when MFA is on. */
export function MagicLinkSignIn({ token, next }: { token: string; next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("magic-link", { token, totp: mfaStep ? code : undefined, redirect: false });
      if (!result || result.error) {
        if (result?.code === "mfa_required") setMfaStep(true);
        else setError(mfaStep ? "That code didn't work. Check your authenticator app or use a recovery code." : "This link has expired or was already used. Ask for a new one.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Sign-in is unavailable right now. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {mfaStep ? (
        <Field label="Verification code" required helperText="The six-digit code from your authenticator app, or a recovery code.">
          <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={32} />
        </Field>
      ) : null}
      <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>{mfaStep ? "Verify and sign in" : "Sign in"}</Button>
      <Link href="/login" className="self-center text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">Back to sign in</Link>
    </form>
  );
}
