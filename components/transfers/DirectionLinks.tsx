import Link from "next/link";
import { cn } from "@/lib/cn";

/** Filter-chip links (fully round, teal when selected) for list toolbars. */
export function DirectionLinks({ items, label }: { items: Array<{ href: string; label: string; active: boolean }>; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors duration-[200ms] ease-yy",
            item.active ? "border-accent-text bg-primary text-on-primary" : "border-line-strong bg-panel text-ink-secondary hover:bg-subtle hover:text-ink",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
