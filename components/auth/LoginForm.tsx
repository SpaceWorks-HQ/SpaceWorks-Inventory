"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { requestMagicLink } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { safeAuthRedirect } from "@/lib/authRedirect";

const ERRORS: Record<string, string> = {
  disabled: "This account is disabled. Contact your space's inventory manager.",
  link: "That sign-in link has expired or was already used. Ask for a new one.",
};

type Mode = "password" | "link" | "link-sent";

/** Email + password, or an emailed one-use link; either asks for the authenticator code when MFA is on. */
export function LoginForm({ signupOpen = false }: { signupOpen?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = safeAuthRedirect(params.get("callbackUrl"));
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaStep, setMfaStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    const value = params.get("error");
    if (!value) return null;
    return ERRORS[value] ?? "Sign-in couldn't be completed. Try again.";
  });
  const resetDone = params.get("reset") === "1";

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", { email, password, totp: mfaStep ? code : undefined, redirect: false });
      if (!result || result.error) {
        if (result?.code === "mfa_required") setMfaStep(true);
        else setError(mfaStep ? "That code didn't work. Check your authenticator app or use a recovery code." : "Wrong email or password. Try again, reset your password or use an email link.");
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Sign-in is unavailable right now. Refresh the page and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submitLink(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await requestMagicLink({ email, callbackUrl });
      if (!result.ok) setError(result.error);
      else setMode("link-sent");
    } catch {
      setError("We couldn't send the link right now. Try again in a minute.");
    } finally {
      setLoading(false);
    }
  }

  if (mfaStep) {
    return (
      <form className="flex flex-col gap-5" onSubmit={submitPassword}>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-h3 text-ink">Two-step verification</h2>
          <p className="text-body-ui text-ink-secondary">Enter the six-digit code from your authenticator app, or one of your recovery codes.</p>
        </div>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Verification code" required>
          <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={32} />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>Verify and sign in</Button>
        <Button variant="quiet" className="self-center" onClick={() => { setMfaStep(false); setCode(""); setError(null); }}>
          Use a different account
        </Button>
      </form>
    );
  }

  if (mode === "link-sent") {
    return (
      <div className="flex flex-col gap-4">
        <Callout tone="success" role="status">If {email} has an account, a sign-in link is on its way. It works once and expires in 15 minutes.</Callout>
        <Button variant="secondary" size="lg" fullWidth onClick={() => setMode("password")}>Back to sign in</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {resetDone ? <Callout tone="success" role="status">Password updated. Sign in with your new password.</Callout> : null}
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {mode === "password" ? (
        <form className="flex flex-col gap-4" onSubmit={submitPassword}>
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <div className="relative">
            <Field label="Password" required>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" maxLength={128} />
            </Field>
            <Link href="/forgot-password" className="absolute right-0 top-0 text-sm font-semibold text-ink-secondary underline underline-offset-4 hover:text-ink">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading} className="mt-1">Sign in</Button>
        </form>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={submitLink}>
          <Field label="Email" required helperText="We'll email you a link that signs you in once.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </Field>
          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>Email me a sign-in link</Button>
        </form>
      )}
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span aria-hidden className="h-px flex-1 bg-line" />
        or
        <span aria-hidden className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" size="lg" fullWidth onClick={() => { setError(null); setMode(mode === "password" ? "link" : "password"); }}>
        {mode === "password" ? "Email me a sign-in link" : "Sign in with a password"}
      </Button>
      <p className="text-center text-sm text-ink-muted">
        {signupOpen ? <>New here? <Link href="/signup" className="font-semibold text-ink underline underline-offset-4">Create an account</Link>, then ask your space for an invitation.</> : "Spaces are invite-only. Ask a space's inventory manager for an invitation."}
      </p>
    </div>
  );
}
