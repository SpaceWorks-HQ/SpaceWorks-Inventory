"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/choice";
import { Card, Chip, EmptyState } from "@/components/ui/display";
import { SearchInput } from "@/components/ui/field";
import { addKitToTray, addToTray, TRAY_MAX_LINES } from "@/lib/desk/borrowTray";
import { matchesSearch } from "@/lib/desk/catalogueWords";
import { ItemCard, type CatalogueItem } from "./ItemCard";
import { RequestTray } from "./RequestTray";
import { useTray } from "./useTray";

export type CatalogueKit = { id: string; name: string; description: string | null; lines: { itemId: string; quantity: number; name: string }[]; ready: boolean };

/** Browse what can be borrowed, filter by category, and build a request. */
export function CatalogueBrowser({ slug, items, kits, categories, blocked, minDate }: {
  slug: string; items: CatalogueItem[]; kits: CatalogueKit[]; categories: { id: string; name: string }[]; blocked: string | null; minDate: string;
}) {
  const { showToast } = useToast();
  const ids = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const names = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item.name])), [items]);
  const [tray, setTray] = useTray(slug, ids);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const shown = items.filter((item) => (!category || item.categoryId === category) && matchesSearch(item, query));
  const shownKits = category ? [] : kits.filter((kit) => matchesSearch({ name: kit.name, sku: "", brand: null, model: null, category: null, tags: kit.lines.map((l) => l.name) }, query));
  const full = () => showToast(`A request can hold ${TRAY_MAX_LINES} different items. Send this one first.`, "warning");

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-3">
          <label htmlFor="catalogue-search" className="sr-only">Search the catalogue</label>
          <SearchInput id="catalogue-search" value={query} onChange={(event) => setQuery(event.target.value)} onClear={() => setQuery("")} placeholder="Search tools and parts" maxLength={100} />
          {categories.length ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
              <FilterChip selected={category === null} onClick={() => setCategory(null)}>All</FilterChip>
              {categories.map((c) => <FilterChip key={c.id} selected={category === c.id} onClick={() => setCategory(category === c.id ? null : c.id)}>{c.name}</FilterChip>)}
            </div>
          ) : null}
        </div>
        {shownKits.length ? (
          <section aria-label="Kits" className="flex flex-col gap-3">
            <h2 className="text-h4 text-ink">Kits</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {shownKits.map((kit) => (
                <li key={kit.id} className="min-w-0"><Card as="article" className="flex h-full flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-title text-ink">{kit.name}</h3>
                    <Chip tone={kit.ready ? "success" : "warning"}>{kit.ready ? "Available" : "Partly on loan"}</Chip>
                  </div>
                  {kit.description ? <p className="text-body-ui text-ink-secondary">{kit.description}</p> : null}
                  <p className="text-caption text-ink-muted">{kit.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}</p>
                  <Button variant="secondary" startIcon={<Plus />} className="self-start" onClick={() => { const next = addKitToTray(tray, kit.lines); setTray(next.tray); if (!next.added) full(); else showToast(`${kit.name} added to your request.`, "success"); }}>Add kit to request</Button>
                </Card></li>
              ))}
            </ul>
          </section>
        ) : null}
        <section aria-label="Items" className="flex flex-col gap-3">
          {shownKits.length ? <h2 className="text-h4 text-ink">Items</h2> : null}
          {shown.length === 0 ? (
            <EmptyState>{query || category ? "Nothing matches. Try another word or category." : "Nothing can be borrowed yet. Ask staff which tools are lendable."}</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-3">
              {shown.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  inTray={tray.find((line) => line.itemId === item.id)?.quantity ?? 0}
                  disabled={false}
                  onAdd={() => { const next = addToTray(tray, item.id); setTray(next.tray); if (!next.added) full(); else showToast(`${item.name} added to your request.`, "success"); }}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
      <aside className="min-w-0">
        <RequestTray slug={slug} tray={tray} names={names} onChange={setTray} blocked={blocked} minDate={minDate} />
      </aside>
    </div>
  );
}
