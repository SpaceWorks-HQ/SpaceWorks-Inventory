"use client";

import { usePathname, useRouter } from "next/navigation";
import { withDone, type DoneKind } from "@/lib/desk/stepper";

/**
 * After a desk flow succeeds, open the record page's completion card. The
 * navigation also fetches the page's fresh data (it replaces `router.refresh`).
 */
export function useShowDone() {
  const router = useRouter();
  const pathname = usePathname();
  return (kind: DoneKind, path: string = pathname) => router.replace(withDone(path, kind));
}
