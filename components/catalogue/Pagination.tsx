import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { withParams } from "./words";

/** "Page 2 of 7" with previous and next links that keep the current filters. */
export function Pagination({ path, params, page, pageCount, total, noun }: { path: string; params: Record<string, string | number | boolean | null>; page: number; pageCount: number; total: number; noun: string }) {
  if (total === 0) return null;
  const href = (to: number) => withParams(path, { ...params, page: to > 1 ? to : null });
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-body-ui text-ink-muted">{`${total.toLocaleString("en-IN")} ${noun} · page ${page} of ${pageCount}`}</p>
      <div className="flex gap-2">
        {page > 1 ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={href(page - 1)}>Previous</Link> : null}
        {page < pageCount ? <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={href(page + 1)}>Next</Link> : null}
      </div>
    </nav>
  );
}
