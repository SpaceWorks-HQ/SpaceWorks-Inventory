"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchInput } from "@/components/ui/field";

/** Search the queue by member name, email or LN reference (keeps the tab). */
export function LoanSearch({ slug, tab, query }: { slug: string; tab: string; query: string }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const go = (q: string) => {
    const params = new URLSearchParams({ tab });
    if (q.trim()) params.set("q", q.trim());
    router.push(`/s/${slug}/loans?${params.toString()}`);
  };
  return (
    <form role="search" className="w-full sm:max-w-sm" onSubmit={(event) => { event.preventDefault(); go(value); }}>
      <label htmlFor="loan-search" className="sr-only">Search loans</label>
      <SearchInput id="loan-search" value={value} onChange={(event) => setValue(event.target.value)} onClear={() => { setValue(""); go(""); }} placeholder="Member, email or LN-0042" maxLength={100} />
    </form>
  );
}
