import { AvatarImage } from "@/components/ui/avatar-image";
import { cn } from "@/lib/cn";

/** Square item photo, or a flat token fill with the item's initial (never a broken image). */
export function ItemThumb({ name, src, size = "md" }: { name: string; src: string | null; size?: "sm" | "md" | "lg" }) {
  const fallback = <span aria-hidden className="text-label text-ink-muted">{name.trim().charAt(0).toUpperCase() || "?"}</span>;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface", size === "sm" && "size-9", size === "md" && "size-11", size === "lg" && "size-full rounded-lg")}>
      {src ? <AvatarImage src={src} fallback={fallback} /> : fallback}
    </span>
  );
}
