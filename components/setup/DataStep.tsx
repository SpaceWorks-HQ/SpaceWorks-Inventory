"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadSampleDataAction } from "@/app/actions/import";
import { finishSetupAction } from "@/app/actions/setup";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { useToast } from "@/components/feedback/ToastProvider";

/** Fill the catalogue (sample data, a spreadsheet, or nothing yet) and finish setup. */
export function DataStep({ slug, items, completed }: { slug: string; items: number; completed: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [finishing, startFinish] = useTransition();

  return (
    <div className="space-y-6">
      <Card padding="lg" className="space-y-4">
        <CardHeader title="Your catalogue" description={items > 0 ? `This space has ${items} items.` : "Start with a sample makerspace to try things out, import a spreadsheet, or add items one by one later."} />
        {loaded ? <Callout tone="success" role="status">{loaded}</Callout> : null}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2 rounded-lg border border-line p-4">
            <p className="text-label text-ink">Sample data</p>
            <p className="text-caption text-ink-muted">Tools, parts, shelves and kits you can delete later.</p>
            <Button
              variant="secondary"
              loading={pending}
              disabled={items > 0 || Boolean(loaded)}
              onClick={() => startTransition(async () => {
                const result = await loadSampleDataAction(slug);
                if (!result.ok) return showToast(result.error, "error");
                setLoaded(`Added ${result.data?.items ?? 0} items, ${result.data?.locations ?? 0} locations and ${result.data?.assets ?? 0} tagged assets.`);
                router.refresh();
              })}
            >
              Load sample data
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-line p-4">
            <p className="text-label text-ink">Import a spreadsheet</p>
            <p className="text-caption text-ink-muted">CSV or XLSX with your items, stock and locations.</p>
            <Link href={`/s/${slug}/import`} className={buttonClasses({ variant: "secondary" })}>Open import</Link>
          </div>
          <div className="space-y-2 rounded-lg border border-line p-4">
            <p className="text-label text-ink">Start empty</p>
            <p className="text-caption text-ink-muted">Add items from the Items page whenever you are ready.</p>
          </div>
        </div>
      </Card>
      <Card padding="lg" className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-title text-ink">{completed ? "Setup is done" : "Ready when you are"}</p>
          <p className="text-body-ui text-ink-muted">You can come back to any step from Space settings.</p>
        </div>
        <Button
          variant="primary"
          loading={finishing}
          onClick={() => startFinish(async () => {
            const result = await finishSetupAction(slug);
            if (!result.ok) return showToast(result.error, "error");
            showToast("Setup finished.", "success");
            router.push(`/s/${slug}`);
            router.refresh();
          })}
        >
          Finish setup
        </Button>
      </Card>
    </div>
  );
}
