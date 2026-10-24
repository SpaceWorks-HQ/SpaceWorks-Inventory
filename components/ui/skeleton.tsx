import { cn } from "@/lib/cn";

/** A loading placeholder in the final layout's geometry (SpaceWorks-Design ux-spec: loading = skeletons). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("sw-skeleton block rounded-md bg-surface", className)} />;
}
