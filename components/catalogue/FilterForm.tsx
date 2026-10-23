"use client";

import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * A GET form for list filters: dropdowns, checkboxes and dates apply at once;
 * the search box applies on Enter or with the button. Filters live in the URL.
 */
export function FilterForm({ action, children, label }: { action: string; children: ReactNode; label: string }) {
  return (
    <Form
      action={action}
      aria-label={label}
      className="grid min-w-0 gap-3 rounded-xl border border-line bg-panel p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
        if (target.type === "search" || target.type === "text") return;
        event.currentTarget.requestSubmit();
      }}
    >
      {children}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">Apply</Button>
        <Button asChild variant="quiet"><Link href={action}>Clear</Link></Button>
      </div>
    </Form>
  );
}
