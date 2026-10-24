"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addSuggestionAction } from "@/app/actions/purchases";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Chip } from "@/components/ui/display";

export type Suggestion = { itemId: string; name: string; sku: string; available: number; reorderPoint: number; reorderQuantity: number | null; onOrder: number; supplier: string | null };

/** Items at or below their reorder point. One tap puts the reorder quantity on the buy list. */
export function SuggestionsPanel({ slug, suggestions }: { slug: string; suggestions: Suggestion[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  if (suggestions.length === 0) return null;

  const add = (row: Suggestion) => {
    setBusy(row.itemId);
    startTransition(async () => {
      const result = await addSuggestionAction(slug, { itemId: row.itemId });
      setBusy(null);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(`${row.name} is on the buy list.`, "success");
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader title="Reorder suggestions" description="Free stock is at or below the reorder point." />
      <ul className="divide-y divide-line">
        {suggestions.map((row) => (
          <li key={row.itemId} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-title text-ink">{row.name}</p>
              <p className="text-caption text-ink-muted">
                {row.sku} · {row.available} available, reorder at {row.reorderPoint}
                {row.supplier ? ` · ${row.supplier}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {row.onOrder > 0 ? <Chip tone="info" size="sm">{`${row.onOrder} on the list`}</Chip> : <Chip tone="warning" size="sm">Not on the list</Chip>}
              <Button size="sm" variant="ghost" loading={busy === row.itemId} disabled={busy !== null} onClick={() => add(row)}>
                {`Add ${Math.max(1, row.reorderQuantity ?? row.reorderPoint)} to buy list`}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
