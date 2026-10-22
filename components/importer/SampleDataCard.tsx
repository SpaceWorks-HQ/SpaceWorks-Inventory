"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loadSampleDataAction } from "@/app/actions/import";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";

/** Offered while the space has no items: fill it with a small sample makerspace to try things out. */
export function SampleDataCard({ slug }: { slug: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = () =>
    startTransition(async () => {
      const result = await loadSampleDataAction(slug);
      setConfirming(false);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(`Sample data loaded: ${result.data?.items ?? 0} items in ${result.data?.locations ?? 0} locations.`, "success");
      router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title="Start with sample data"
        description="A small makerspace: an electronics lab and a workshop, about 25 items with stock, serialized tools, two kits and four containers."
      />
      <div className="mt-4">
        <Button variant="secondary" onClick={() => setConfirming(true)}>Load sample data</Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="Load sample data?"
        message="Locations, categories, items, stock and assets are added to this space. You can archive them later."
        confirmLabel="Load sample data"
        destructive={false}
        loading={pending}
        onConfirm={load}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
