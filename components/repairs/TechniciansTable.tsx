"use client";

import { setTechnicianActiveAction } from "@/app/actions/technicians";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState } from "@/components/ui/display";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CHANNEL_LABEL } from "@/lib/repairs/channels";
import { TechnicianDialog, type TechnicianRow } from "./TechnicianDialog";

/** The technician directory with each entry's channels, skills and open repairs. */
export function TechniciansTable({ slug, rows }: { slug: string; rows: TechnicianRow[] }) {
  const { run, pending, error } = useActionRunner();
  if (rows.length === 0) return <EmptyState patch title="No technicians yet.">Add the people who repair things for this space: members with the Technician role or external contacts.</EmptyState>;
  return (
    <>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Table label="Technicians">
        <THead>
          <tr>
            <TH>Technician</TH>
            <TH>Reach by</TH>
            <TH>Skills</TH>
            <TH className="text-right">Working on</TH>
            <TH><span className="sr-only">Actions</span></TH>
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR key={row.id}>
              <TD className="min-w-[180px]">
                <span className="block font-semibold">{row.name}</span>
                <span className="flex flex-wrap gap-1 pt-1">
                  <Chip size="sm" tone={row.kind === "EXTERNAL" ? "outline" : "accent"}>{row.kind === "EXTERNAL" ? "External" : "Member"}</Chip>
                  {row.active ? null : <Chip size="sm" tone="neutral">Inactive</Chip>}
                </span>
              </TD>
              <TD className="text-ink-secondary">
                {[row.email ? "Email" : null, row.whatsapp ? "WhatsApp" : null, row.telegramChatId ? "Telegram" : null].filter(Boolean).join(", ") || "—"}
                {row.preferredChannel ? <span className="block text-caption text-ink-muted">Prefers {CHANNEL_LABEL[row.preferredChannel]}</span> : null}
              </TD>
              <TD className="text-ink-secondary">{row.skills.join(", ") || "—"}</TD>
              <TD className="text-right tabular-nums">{row.working}</TD>
              <TD className="whitespace-nowrap text-right">
                <span className="inline-flex gap-2">
                  <TechnicianDialog slug={slug} technician={row} trigger={<Button size="sm" variant="secondary">Edit</Button>} />
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => void run(() => setTechnicianActiveAction(slug, { technicianId: row.id, active: !row.active }), row.active ? `${row.name} deactivated.` : `${row.name} reactivated.`)}>{row.active ? "Deactivate" : "Reactivate"}</Button>
                </span>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
