"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveScanAction } from "@/app/actions/scan";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardHeader, Chip } from "@/components/ui/display";
import { SCAN_KIND_WORD } from "@/lib/desk/scanCodes";
import type { ScanTarget } from "@/lib/desk/scan";
import { ScanField } from "./ScanField";

/** The universal scan page: every label opens its page, plus the loan or transfer holding it. */
export function ScanLookup({ slug }: { slug: string }) {
  const [results, setResults] = useState<ScanTarget[]>([]);
  const latest = results[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <ScanField
          autoCamera={false}
          onCode={async (code) => {
            const result = await resolveScanAction(slug, code);
            if (!result.ok || !result.data) return { tone: "warning", text: result.ok ? "That code wasn't found." : result.error };
            const target = result.data;
            setResults((current) => [target, ...current.filter((entry) => entry.code !== target.code)].slice(0, 10));
            return { tone: "success", text: `Found ${target.label}.` };
          }}
        />
      </Card>
      {latest ? (
        <Card as="section" aria-label="Scanned label">
          <CardHeader
            title={latest.label}
            description={SCAN_KIND_WORD[latest.kind]}
            action={<Link href={latest.href} className={buttonClasses({ variant: "primary" })}>Open {latest.kind}</Link>}
          />
          <div className="flex flex-col gap-3">
            {latest.status ? <p className="flex items-center gap-2 text-body-ui text-ink-secondary">Status <Chip tone="neutral">{latest.status}</Chip></p> : null}
            {latest.holders.length ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {latest.holders.map((holder) => (
                  <li key={holder.href} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
                    <span className="text-body-ui text-ink">{holder.kind === "loan" ? "Loan" : "Transfer"} {holder.label} <Chip size="sm" tone="info">{holder.status}</Chip></span>
                    <Link href={holder.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">Open {holder.label}</Link>
                  </li>
                ))}
              </ul>
            ) : latest.kind === "item" || latest.kind === "asset" || latest.kind === "container" ? <p className="text-body-ui text-ink-muted">No open loan or transfer holds it.</p> : null}
          </div>
        </Card>
      ) : null}
      {results.length > 1 ? (
        <Card as="section" aria-label="Earlier scans">
          <CardHeader title="Earlier scans" />
          <ul className="divide-y divide-line">
            {results.slice(1).map((entry) => (
              <li key={entry.code} className="flex min-h-12 items-center justify-between gap-2">
                <span className="text-body-ui text-ink">{entry.label} <span className="text-ink-muted">{SCAN_KIND_WORD[entry.kind]}</span></span>
                <Link href={entry.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text hover:underline">Open</Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
