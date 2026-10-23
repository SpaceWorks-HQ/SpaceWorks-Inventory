"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markSpaceNotificationsReadAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { useToast } from "@/components/feedback/ToastProvider";
import { cn } from "@/lib/cn";

export type NotificationEntry = { id: string; title: string; body: string | null; url: string | null; when: string; whenIso: string; unread: boolean };

export function MarkAllReadButton({ slug, disabled }: { slug: string; disabled: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="primary"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markSpaceNotificationsReadAction(slug, {});
          if (!result.ok) showToast(result.error, "error");
          else router.refresh();
        })
      }
    >
      Mark all read
    </Button>
  );
}

export function NotificationList({ slug, entries }: { slug: string; entries: NotificationEntry[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const markRead = (id: string) =>
    startTransition(async () => {
      const result = await markSpaceNotificationsReadAction(slug, { ids: [id] });
      if (!result.ok) showToast(result.error, "error");
      else router.refresh();
    });

  return (
    <ul className="overflow-hidden rounded-xl border border-line bg-panel">
      {entries.map((entry) => (
        <li key={entry.id} className={cn("flex flex-col gap-2 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between", entry.unread ? "bg-panel" : "bg-surface")}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {entry.unread ? <Chip tone="accent" size="sm">New</Chip> : null}
              {entry.url ? (
                <Link href={entry.url} className="text-title text-ink underline-offset-4 hover:underline" onClick={() => (entry.unread ? markRead(entry.id) : undefined)}>{entry.title}</Link>
              ) : (
                <span className="text-title text-ink">{entry.title}</span>
              )}
            </div>
            {entry.body ? <p className="mt-1 text-body-ui text-ink-secondary">{entry.body}</p> : null}
            <p className="mt-1 text-caption text-ink-muted"><time dateTime={entry.whenIso}>{entry.when}</time></p>
          </div>
          {entry.unread ? (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => markRead(entry.id)} aria-label={`Mark “${entry.title}” read`} className="self-start">
              Mark read
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
