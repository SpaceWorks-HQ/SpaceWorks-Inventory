"use client";

import { useState } from "react";
import type { CountStatus } from "@prisma/client";
import { cancelCountAction, postCountAction, reopenCountAction, submitCountAction } from "@/app/actions/counts";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { countReadiness } from "@/lib/desk/countReadiness";

type Props = { slug: string; countId: string; status: CountStatus; canCount: boolean; canManage: boolean; blocked: boolean; staleLines: number; missingTools: number; recordedLines: number };

/** The next step of a count: submit while counting; post, reopen or cancel once submitted. */
export function CountActions({ slug, countId, status, canCount, canManage, blocked, staleLines, missingTools, recordedLines }: Props) {
  const { run, pending, error } = useActionRunner();
  const [confirm, setConfirm] = useState<"post" | "cancel" | null>(null);
  const input = { countId };
  const open = status === "IN_PROGRESS" || status === "SUBMITTED";
  const { submitReason, postReason } = countReadiness({ recordedLines, staleLines, blocked });
  if (!open) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        {status === "IN_PROGRESS" && canCount ? (
          <Button variant="primary" loading={pending} disabled={Boolean(submitReason)} onClick={() => void run(() => submitCountAction(slug, input), "Count submitted. A manager can post it now.")}>Submit count</Button>
        ) : null}
        {status === "SUBMITTED" && canManage ? (
          <>
            <Button variant={missingTools > 0 ? "danger" : "primary"} disabled={pending || Boolean(postReason)} onClick={() => setConfirm("post")}>Post to stock</Button>
            <Button variant="secondary" disabled={pending} onClick={() => void run(() => reopenCountAction(slug, input), "Count reopened for counting.")}>Reopen</Button>
          </>
        ) : null}
        {canManage ? <Button variant="danger" disabled={pending} onClick={() => setConfirm("cancel")}>Cancel count…</Button> : null}
      </div>
      {status === "IN_PROGRESS" && canCount && submitReason ? <p className="text-caption text-ink-muted">{submitReason}</p> : null}
      {status === "SUBMITTED" && canManage && postReason ? <p className="text-caption text-ink-muted">{postReason}</p> : null}
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <ConfirmDialog
        open={confirm === "post" && !postReason}
        title="Post this count?"
        message={`${missingTools} ${missingTools === 1 ? "tool will" : "tools will"} be marked missing. ${staleLines ? `${staleLines} ${staleLines === 1 ? "line has" : "lines have"} moved since the count started; posting will be refused until they are recounted.` : "Stock is set to what was counted for every counted line. Uncounted lines are left alone."}`}
        confirmLabel="Post to stock"
        destructive={missingTools > 0}
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { if (!postReason) void run(() => postCountAction(slug, input), "Count posted to stock.").then(() => setConfirm(null)); }}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        title="Cancel this count?"
        message="Nothing is posted to stock and counters can't add to it any more."
        confirmLabel="Cancel count"
        cancelLabel="Keep count"
        loading={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run(() => cancelCountAction(slug, input), "Count cancelled.").then(() => setConfirm(null))}
      />
    </div>
  );
}
