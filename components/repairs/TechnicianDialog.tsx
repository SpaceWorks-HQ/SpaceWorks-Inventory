"use client";

import { useState } from "react";
import type { TechnicianChannel, TechnicianKind } from "@prisma/client";
import { addExternalTechnicianAction, addStaffTechnicianAction, updateTechnicianAction } from "@/app/actions/technicians";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Dropdown } from "@/components/ui/select";

export type TechnicianRow = { id: string; kind: TechnicianKind; name: string; email: string | null; phone: string | null; whatsapp: string | null; telegramChatId: string | null; skills: string[]; preferredChannel: TechnicianChannel | null; notes: string | null; active: boolean; working: number };

/** Add an external contact or a member to the directory, or edit an entry. */
export function TechnicianDialog({ slug, members = [], technician, trigger }: { slug: string; members?: { userId: string; label: string }[]; technician?: TechnicianRow; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<TechnicianKind>(technician?.kind ?? "EXTERNAL");
  const [form, setForm] = useState({ userId: members[0]?.userId ?? "", name: technician?.name ?? "", email: technician?.email ?? "", phone: technician?.phone ?? "", whatsapp: technician?.whatsapp ?? "", telegramChatId: technician?.telegramChatId ?? "", skills: technician?.skills.join(", ") ?? "", preferredChannel: technician?.preferredChannel ?? "", notes: technician?.notes ?? "" });
  const { run, pending, error } = useActionRunner();
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const contact = { phone: form.phone, whatsapp: form.whatsapp, telegramChatId: form.telegramChatId, skills: form.skills.split(",").map((skill) => skill.trim()).filter(Boolean), preferredChannel: (form.preferredChannel || null) as TechnicianChannel | null, notes: form.notes };
  const submit = () => {
    const work = technician
      ? () => updateTechnicianAction(slug, { technicianId: technician.id, name: form.name, email: form.email, ...contact })
      : kind === "EXTERNAL" ? () => addExternalTechnicianAction(slug, { name: form.name, email: form.email, ...contact }) : () => addStaffTechnicianAction(slug, { userId: form.userId, ...contact });
    void run(work, technician ? "Technician updated." : "Technician added.").then((ok) => ok && setOpen(false));
  };
  const member = technician ? technician.kind === "STAFF" : kind === "STAFF";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button variant="primary">Add a technician</Button>}</DialogTrigger>
      <DialogContent size="md">
        <form className="contents" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <DialogHeader title={technician ? `Edit ${technician.name}` : "Add a technician"} description="Skills help you pick who to ask. Contact details are only used to send repair requests." />
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            {!technician ? (
              <div className="sm:col-span-2">
                <SegmentedControl ariaLabel="Kind of technician" value={kind} onValueChange={(value) => setKind(value)} options={[{ value: "EXTERNAL", label: "External contact" }, { value: "STAFF", label: "Member" }]} />
              </div>
            ) : null}
            {member && !technician ? (
              members.length === 0 ? <Callout tone="info" className="sm:col-span-2">Give someone the Technician role on the Members page first.</Callout> : (
                <Field label="Member" className="sm:col-span-2">
                  <Dropdown value={form.userId} onChange={set("userId")}>{members.map((entry) => <option key={entry.userId} value={entry.userId}>{entry.label}</option>)}</Dropdown>
                </Field>
              )
            ) : null}
            {!member ? (
              <>
                <Field label="Name"><Input value={form.name} onChange={set("name")} maxLength={120} required /></Field>
                <Field label="Email" helperText="Every request is emailed."><Input type="email" value={form.email} onChange={set("email")} required /></Field>
                <Field label="Phone" optional><Input type="tel" value={form.phone} onChange={set("phone")} maxLength={40} /></Field>
              </>
            ) : null}
            <Field label="WhatsApp number" optional helperText="With the country code."><Input type="tel" value={form.whatsapp} onChange={set("whatsapp")} placeholder="+91…" /></Field>
            <Field label="Telegram chat ID" optional><Input value={form.telegramChatId} onChange={set("telegramChatId")} /></Field>
            <Field label="Prefers" optional>
              <Dropdown value={form.preferredChannel} onChange={set("preferredChannel")}>
                <option value="">No preference</option>
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="TELEGRAM">Telegram</option>
              </Dropdown>
            </Field>
            <Field label="Skills" optional helperText="Comma separated, for example electrical, 3d printers." className="sm:col-span-2"><Input value={form.skills} onChange={set("skills")} /></Field>
            <Field label="Notes" optional className="sm:col-span-2"><Textarea value={form.notes} onChange={set("notes")} rows={2} maxLength={1000} /></Field>
            {error ? <Callout tone="danger" role="alert" className="sm:col-span-2">{error}</Callout> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} disabled={member && !technician && members.length === 0}>{technician ? "Save" : "Add technician"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
