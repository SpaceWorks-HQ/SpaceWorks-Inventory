import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export type AuditEntry = {
  id: string;
  when: string;
  whenIso: string;
  what: string;
  action: string;
  actor: string;
  target: string | null;
  details: { label: string; value: string }[];
};

export function AuditTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <Table label="Audit log">
      <THead>
        <tr>
          <TH>When</TH>
          <TH>What happened</TH>
          <TH>By</TH>
          <TH>Target</TH>
        </tr>
      </THead>
      <TBody>
        {entries.map((entry) => (
          <TR key={entry.id}>
            <TD className="whitespace-nowrap align-top text-ink-muted"><time dateTime={entry.whenIso}>{entry.when}</time></TD>
            <TD className="min-w-[240px] align-top">
              <span className="block font-semibold">{entry.what}</span>
              <span className="code-text block text-caption text-ink-muted">{entry.action}</span>
              {entry.details.length > 0 ? (
                <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-ink-secondary">
                  {entry.details.map((detail) => (
                    <div key={detail.label} className="flex gap-1">
                      <dt className="text-ink-muted">{detail.label}:</dt>
                      <dd className="break-all">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </TD>
            <TD className="min-w-[140px] align-top">{entry.actor}</TD>
            <TD className="whitespace-nowrap align-top text-ink-muted">{entry.target ?? "None"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
