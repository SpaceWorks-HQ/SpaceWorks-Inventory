"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { savePaymentSettingsAction, testPaymentConnectionAction } from "@/app/actions/payments";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Card, Chip, SettingsRow } from "@/components/ui/display";
import { Field, Input, PasswordInput, ReadOnlyValue, Textarea } from "@/components/ui/field";
import type { PaymentConfigView } from "@/lib/payments/config";

type Secrets = { razorpaySecret: string; razorpayWebhookSecret: string; stripeSecret: string; stripeWebhookSecret: string };
const EMPTY: Secrets = { razorpaySecret: "", razorpayWebhookSecret: "", stripeSecret: "", stripeWebhookSecret: "" };

function SavedChip({ set }: { set: boolean }) {
  return set ? <Chip tone="success" size="sm">Saved</Chip> : <Chip tone="neutral" size="sm">Not set</Chip>;
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { showToast } = useToast();
  return (
    <Field label={label} helperText="Add this URL in the provider's dashboard and paste the signing secret above.">
      <ReadOnlyValue
        value={value}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(value).then(() => showToast("Webhook URL copied.", "success"), () => showToast("Couldn't copy. Select the URL and copy it.", "error"))}>
            Copy
          </Button>
        }
      />
    </Field>
  );
}

function SecretField({ label, set, value, onChange, placeholder, error }: { label: ReactNode; set: boolean; value: string; onChange: (value: string) => void; placeholder: string; error?: string }) {
  return (
    <Field label={<span className="inline-flex items-center gap-2">{label} <SavedChip set={set} /></span>} helperText={set ? "Leave blank to keep the saved value." : undefined} error={error}>
      <PasswordInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={set ? "Saved" : placeholder} autoComplete="off" spellCheck={false} />
    </Field>
  );
}

export function PaymentSettingsForm({ slug, currency, config }: { slug: string; currency: string; config: PaymentConfigView }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    razorpayEnabled: config.razorpayEnabled,
    razorpayKeyId: config.razorpayKeyId,
    stripeEnabled: config.stripeEnabled,
    testMode: config.testMode,
    offlineEnabled: config.offlineEnabled,
    offlineInstructions: config.offlineInstructions,
  });
  const [secrets, setSecrets] = useState<Secrets>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [saving, startSave] = useTransition();
  const [testing, setTesting] = useState<"RAZORPAY" | "STRIPE" | null>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const secret = (key: keyof Secrets) => (value: string) => setSecrets((current) => ({ ...current, [key]: value }));
  const fieldError = (key: string) => errors[key]?.[0];

  const save = () =>
    startSave(async () => {
      const result = await savePaymentSettingsAction(slug, { ...form, ...secrets });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        showToast(result.error, "error");
        return;
      }
      setErrors({});
      setSecrets(EMPTY);
      showToast("Payment settings saved.", "success");
      router.refresh();
    });

  const test = async (provider: "RAZORPAY" | "STRIPE") => {
    setTesting(provider);
    const result = await testPaymentConnectionAction(slug, { provider });
    setTesting(null);
    showToast(result.ok ? `${provider === "RAZORPAY" ? "Razorpay" : "Stripe"} accepted the saved keys.` : result.error, result.ok ? "success" : "error");
  };

  return (
    <form onSubmit={(event) => { event.preventDefault(); save(); }} className="space-y-6">
      <Card padding="lg">
        <SettingsRow title="Mode" description={`Charges are in ${currency}. Use test keys until you have tried a payment end to end.`}>
          <SwitchRow label="Test mode" description="Use the provider's test keys while this is on. No real money moves." checked={form.testMode} onCheckedChange={(value) => set("testMode", value)} />
        </SettingsRow>
        <SettingsRow title="Razorpay" description="UPI, cards and net banking in India. Members pay on a Razorpay checkout window.">
          <div className="flex flex-col gap-4">
            <SwitchRow label="Take payments with Razorpay" checked={form.razorpayEnabled} onCheckedChange={(value) => set("razorpayEnabled", value)} />
            <Field label="Key id" error={fieldError("razorpayKeyId")}>
              <Input value={form.razorpayKeyId} onChange={(e) => set("razorpayKeyId", e.target.value)} placeholder="rzp_test_…" autoComplete="off" spellCheck={false} />
            </Field>
            <SecretField label="Key secret" set={config.razorpaySecretSet} value={secrets.razorpaySecret} onChange={secret("razorpaySecret")} placeholder="Paste the key secret" error={fieldError("razorpaySecret")} />
            <SecretField label="Webhook secret" set={config.razorpayWebhookSecretSet} value={secrets.razorpayWebhookSecret} onChange={secret("razorpayWebhookSecret")} placeholder="The secret you set on the webhook" error={fieldError("razorpayWebhookSecret")} />
            {config.webhookUrls ? <CopyField label="Razorpay webhook URL" value={config.webhookUrls.razorpay} /> : <p className="text-caption text-ink-muted">Save once to get this space&apos;s webhook URL.</p>}
            <p className="text-caption text-ink-muted">Subscribe to payment.captured, payment.failed, refund.processed and refund.failed.</p>
            <div>
              <Button onClick={() => test("RAZORPAY")} loading={testing === "RAZORPAY"} disabled={!config.razorpaySecretSet || testing !== null}>Test connection</Button>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow title="Stripe" description="Cards and wallets worldwide. Members pay on Stripe's checkout page.">
          <div className="flex flex-col gap-4">
            <SwitchRow label="Take payments with Stripe" checked={form.stripeEnabled} onCheckedChange={(value) => set("stripeEnabled", value)} />
            <SecretField label="Secret key" set={config.stripeSecretSet} value={secrets.stripeSecret} onChange={secret("stripeSecret")} placeholder="sk_test_… or rk_test_…" error={fieldError("stripeSecret")} />
            <SecretField label="Webhook signing secret" set={config.stripeWebhookSecretSet} value={secrets.stripeWebhookSecret} onChange={secret("stripeWebhookSecret")} placeholder="whsec_…" error={fieldError("stripeWebhookSecret")} />
            {config.webhookUrls ? <CopyField label="Stripe webhook URL" value={config.webhookUrls.stripe} /> : <p className="text-caption text-ink-muted">Save once to get this space&apos;s webhook URL.</p>}
            <p className="text-caption text-ink-muted">Send checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired and refund events.</p>
            <div>
              <Button onClick={() => test("STRIPE")} loading={testing === "STRIPE"} disabled={!config.stripeSecretSet || testing !== null}>Test connection</Button>
            </div>
          </div>
        </SettingsRow>
        <SettingsRow title="Pay at the desk" description="Cash, UPI to the space's account or bank transfer. Staff confirm each payment.">
          <div className="flex flex-col gap-4">
            <SwitchRow label="Members can tell you they paid offline" checked={form.offlineEnabled} onCheckedChange={(value) => set("offlineEnabled", value)} />
            <Field label="Instructions for members" optional helperText="Shown next to the offline option, e.g. the UPI id or bank details." error={fieldError("offlineInstructions")}>
              <Textarea value={form.offlineInstructions} onChange={(e) => set("offlineInstructions", e.target.value)} rows={3} maxLength={1000} />
            </Field>
          </div>
        </SettingsRow>
      </Card>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={saving}>Save changes</Button>
      </div>
    </form>
  );
}
