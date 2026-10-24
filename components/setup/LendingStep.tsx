"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsSection } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { RadioCard, RadioGroup, SwitchRow } from "@/components/ui/choice";
import { Field, PrefixInput } from "@/components/ui/field";
import { useToast } from "@/components/feedback/ToastProvider";
import { moneyInputValue, parseMoneyInput } from "@/lib/format/quantity";
import type { SectionValues } from "@/lib/settings/sections";
import { feesForChoice, LENDING_CHOICES, lendingChoiceOf, type FeesValues, type LendingChoice } from "@/lib/setup/wizard";

type Props = { slug: string; lending: SectionValues<"lending">; fees: FeesValues; currency: string; minorDigits: number; nextHref: string };

/** The few lending decisions every space makes first; the full policy lives in Space settings. */
export function LendingStep({ slug, lending, fees, currency, minorDigits, nextHref }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [switches, setSwitches] = useState({ lendingEnabled: lending.lendingEnabled, selfCheckoutEnabled: lending.selfCheckoutEnabled, publicCatalogue: lending.publicCatalogue });
  const [choice, setChoice] = useState<LendingChoice>(lendingChoiceOf(fees));
  const startAmount = choice === "rental" ? fees.rentalMinor : fees.depositMinor;
  const [amount, setAmount] = useState(startAmount > 0 ? moneyInputValue(startAmount, minorDigits) : "");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  const save = () => {
    const minor = choice === "free" ? 0 : parseMoneyInput(amount, minorDigits);
    if (choice !== "free" && (minor === null || Number.isNaN(minor) || minor <= 0)) return setError(`Enter an amount in ${currency}.`);
    setError(undefined);
    startTransition(async () => {
      const first = await updateSettingsSection(slug, "lending", { ...lending, ...switches });
      if (!first.ok) return showToast(first.error, "error");
      const second = await updateSettingsSection(slug, "fees", feesForChoice(fees, choice, minor ?? 0));
      if (!second.ok) return showToast(second.error, "error");
      showToast("Lending settings saved.", "success");
      router.push(nextHref);
    });
  };

  return (
    <Card padding="lg" className="space-y-6">
      <CardHeader title="Lending" description="Members borrow tools from the catalogue; staff hand them over with a QR scan and a photo." />
      <div className="space-y-4">
        <SwitchRow label="Lending is on" description="Members can browse the catalogue and request loans." checked={switches.lendingEnabled} onCheckedChange={(v) => setSwitches((s) => ({ ...s, lendingEnabled: v }))} />
        <SwitchRow label="Self-checkout" description="Members can scan and take items marked for self-checkout without waiting for staff." checked={switches.selfCheckoutEnabled} onCheckedChange={(v) => setSwitches((s) => ({ ...s, selfCheckoutEnabled: v }))} />
        <SwitchRow label="Public catalogue" description="Anyone with the link can see what you lend, without signing in. Exact counts stay private." checked={switches.publicCatalogue} onCheckedChange={(v) => setSwitches((s) => ({ ...s, publicCatalogue: v }))} />
      </div>
      <fieldset className="space-y-3">
        <legend className="text-label text-ink">What borrowing costs</legend>
        <RadioGroup value={choice} onValueChange={(v) => setChoice(v as LendingChoice)} className="grid gap-3 sm:grid-cols-3" aria-label="What borrowing costs">
          {LENDING_CHOICES.map((option) => <RadioCard key={option.value} value={option.value} label={option.label} description={option.description} />)}
        </RadioGroup>
        {choice !== "free" ? (
          <Field label={choice === "deposit" ? "Deposit per loan" : "Rental per day"} error={error} helperText="Items and categories can override this later.">
            <PrefixInput prefix={currency} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="max-w-40" />
          </Field>
        ) : null}
      </fieldset>
      <Button variant="primary" loading={pending} onClick={save}>Save and continue</Button>
    </Card>
  );
}
