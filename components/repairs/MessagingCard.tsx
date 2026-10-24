"use client";

import { useState } from "react";
import { saveTechnicianMessagingAction } from "@/app/actions/technicians";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, Card } from "@/components/ui/display";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import type { ChatSettingsView } from "@/lib/repairs/chat";

/** Telegram bot and WhatsApp Cloud API credentials. Saved tokens are never shown again; leave a field blank to keep it. */
export function MessagingCard({ slug, settings }: { slug: string; settings: ChatSettingsView }) {
  const [form, setForm] = useState({ telegramBotToken: "", whatsappPhoneNumberId: settings.whatsappPhoneNumberId ?? "", whatsappToken: "", whatsappTemplate: settings.whatsappTemplate, whatsappLanguage: settings.whatsappLanguage });
  const [clearTelegram, setClearTelegram] = useState(false);
  const [clearWhatsapp, setClearWhatsapp] = useState(false);
  const { run, pending, error } = useActionRunner();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  return (
    <Card padding="lg">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void run(() => saveTechnicianMessagingAction(slug, { ...form, clearTelegram, clearWhatsapp }), "Messaging saved.").then((ok) => ok && setForm((value) => ({ ...value, telegramBotToken: "", whatsappToken: "" }))); }}>
        <fieldset className="grid gap-3">
          <legend className="text-label text-ink">Telegram {settings.telegram ? "(connected)" : "(not set up)"}</legend>
          <Field label="Bot token" optional helperText={settings.telegram ? "Saved. Paste a new one to replace it." : "From @BotFather. Technicians message the bot once to get their chat ID."}>
            <PasswordInput value={form.telegramBotToken} onChange={set("telegramBotToken")} autoComplete="off" />
          </Field>
          {settings.telegram ? <CheckboxField label="Remove the Telegram bot" checked={clearTelegram} onCheckedChange={(value) => setClearTelegram(value === true)} /> : null}
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className="text-label text-ink">WhatsApp {settings.whatsapp ? "(connected)" : "(not set up)"}</legend>
          <Field label="Phone number ID" optional><Input value={form.whatsappPhoneNumberId} onChange={set("whatsappPhoneNumberId")} inputMode="numeric" /></Field>
          <Field label="Access token" optional helperText={settings.whatsapp ? "Saved. Paste a new one to replace it." : "A permanent token from Meta Business."}>
            <PasswordInput value={form.whatsappToken} onChange={set("whatsappToken")} autoComplete="off" />
          </Field>
          <Field label="Message template" helperText="An approved template with one body parameter."><Input value={form.whatsappTemplate} onChange={set("whatsappTemplate")} /></Field>
          <Field label="Template language"><Input value={form.whatsappLanguage} onChange={set("whatsappLanguage")} /></Field>
          {settings.whatsapp ? <CheckboxField label="Remove WhatsApp" checked={clearWhatsapp} onCheckedChange={(value) => setClearWhatsapp(value === true)} /> : null}
        </fieldset>
        {error ? <Callout tone="danger" role="alert" className="sm:col-span-2">{error}</Callout> : null}
        <div className="flex justify-end sm:col-span-2"><Button type="submit" variant="primary" loading={pending}>Save messaging</Button></div>
      </form>
    </Card>
  );
}
