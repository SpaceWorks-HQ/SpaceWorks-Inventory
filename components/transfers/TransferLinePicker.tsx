"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/field";
import { QuantityInput } from "@/components/desk/QuantityInput";

export type PickableItem = { id: string; name: string; sku: string; available: number };
export type PickedLine = { itemId: string; quantity: number };

/** Search the items that can move, add them as lines and set quantities (never more than are free). */
export function TransferLinePicker({ items, lines, onChange, disabled, onOneShelf = false }: { items: PickableItem[]; lines: PickedLine[]; onChange: (lines: PickedLine[]) => void; disabled?: boolean; onOneShelf?: boolean }) {
  const [query, setQuery] = useState("");
  const byId = new Map(items.map((item) => [item.id, item]));
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? items.filter((item) => !lines.some((line) => line.itemId === item.id) && (item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle))).slice(0, 8)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search items by name or SKU" aria-label="Search items to add" disabled={disabled} />
      {needle && matches.length === 0 ? <p className="text-body-ui text-ink-muted">No free stock matches that search here.</p> : null}
      {matches.length ? (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {matches.map((item) => (
            <li key={item.id} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
              <span className="min-w-0 text-body-ui text-ink">{item.name} <span className="text-ink-muted">{item.sku} · {item.available} {onOneShelf ? "on one shelf" : "free"}</span></span>
              <Button size="sm" variant="ghost" onClick={() => { onChange([...lines, { itemId: item.id, quantity: 1 }]); setQuery(""); }}>Add</Button>
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-body-ui text-ink-muted">No items yet. Search above to add what should move.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
          {lines.map((line) => {
            const item = byId.get(line.itemId);
            const label = item ? item.name : "Item no longer free here";
            return (
              <li key={line.itemId} className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0">
                  <span className="block text-body-ui text-ink">{label}</span>
                  <span className="block text-caption text-ink-muted">{item ? `${item.sku} · ${item.available} ${onOneShelf ? "on one shelf" : "free"}` : "Remove this line"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <QuantityInput label={`Quantity of ${label}`} value={line.quantity} min={1} max={item?.available ?? 1} disabled={disabled} onChange={(quantity) => onChange(lines.map((l) => (l.itemId === line.itemId ? { ...l, quantity } : l)))} />
                  <Button variant="dangerQuiet" size="sm" disabled={disabled} onClick={() => onChange(lines.filter((l) => l.itemId !== line.itemId))} aria-label={`Remove ${label}`}>Remove</Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
