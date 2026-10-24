import Image from "next/image";
import { Chip, type ChipTone } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import type { PublicItem } from "@/lib/setup/publicCatalogue";

const TONE: Record<PublicItem["availability"], ChipTone> = { Available: "success", "On loan": "warning", "Out of stock": "danger" };

/** One lendable item on the public catalogue: photo, availability word and fees. No counts. */
export function PublicItemCard({ item, highlighted }: { item: PublicItem; highlighted: boolean }) {
  return (
    <li id={`item-${item.id}`} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-panel", highlighted ? "border-accent-text" : "border-line")}>
      <div className="flex aspect-square items-center justify-center bg-surface">
        {item.imageUrl ? (
          <Image src={item.imageUrl} alt={item.name} width={400} height={400} unoptimized className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden className="text-h1 text-ink-muted">{item.name.trim().charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <h2 className="text-title text-ink">{item.name}</h2>
          {item.category ? <p className="text-caption text-ink-muted">{item.category}</p> : null}
        </div>
        <div><Chip tone={TONE[item.availability]}>{item.availability}</Chip></div>
        {item.description ? <p className="line-clamp-3 text-body-ui text-ink-secondary">{item.description}</p> : null}
        <p className="mt-auto text-body-ui text-ink-secondary">{item.fees.join(" · ")}</p>
      </div>
    </li>
  );
}
