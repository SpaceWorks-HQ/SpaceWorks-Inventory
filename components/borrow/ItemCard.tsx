"use client";

import Image from "next/image";
import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";

export type CatalogueItem = {
  id: string; name: string; sku: string; description: string | null; brand: string | null; model: string | null; tags: string[];
  consumable: boolean; categoryId: string | null; category: string | null; unitSymbol: string | null; imageUrl: string | null;
  available: number; availability: { text: string; tone: "success" | "warning" | "danger" }; fees: string[];
};

/** One borrowable item: photo, availability in words, fees, and add-to-request. */
export function ItemCard({ item, inTray, onAdd, disabled }: { item: CatalogueItem; inTray: number; onAdd: () => void; disabled: boolean }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex aspect-square items-center justify-center bg-surface">
        {item.imageUrl && failedImage !== item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} width={400} height={400} unoptimized className="h-full w-full object-cover" onError={() => setFailedImage(item.imageUrl)} />
        ) : (
          <Package aria-hidden="true" className="size-5 text-ink-muted" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <h3 className="text-title text-ink">{item.name}</h3>
          <p className="text-caption text-ink-muted">{[item.category, item.brand, item.consumable ? "Used up, not returned" : null].filter(Boolean).join(" · ") || item.sku}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={item.availability.tone}>{item.availability.text}</Chip>
        </div>
        <p className="text-body-ui text-ink-secondary">{item.fees.join(" · ")}</p>
        <div className="mt-auto pt-1">
          <Button variant="secondary" fullWidth startIcon={<Plus />} onClick={onAdd} disabled={disabled} aria-label={`Add ${item.name} to your request`}>
            {inTray ? `Add another (${inTray} in request)` : "Add to request"}
          </Button>
        </div>
      </div>
    </li>
  );
}
