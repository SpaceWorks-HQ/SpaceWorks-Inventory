import { Card, CardHeader } from "@/components/ui/display";

export type TimelineEntry = { id: string; title: string; detail?: string | null; actorName: string; whenLabel: string };

/** The audit trail of one record, newest first. */
export function Timeline({ entries, title = "Timeline" }: { entries: TimelineEntry[]; title?: string }) {
  return (
    <Card as="section" aria-label={title}>
      <CardHeader title={title} />
      {entries.length === 0 ? (
        <p className="text-body-ui text-ink-muted">Nothing has happened yet.</p>
      ) : (
        <ol className="flex flex-col">
          {entries.map((entry) => (
            <li key={entry.id} className="relative border-l border-line pb-4 pl-4 last:pb-0">
              <span aria-hidden className="absolute -left-[5px] top-1.5 size-2.5 rounded-full bg-accent-text" />
              <p className="text-label text-ink">{entry.title}</p>
              <p className="text-caption text-ink-muted">{entry.actorName} · {entry.whenLabel}</p>
              {entry.detail ? <p className="mt-1 whitespace-pre-line text-body-ui text-ink-secondary">{entry.detail}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
