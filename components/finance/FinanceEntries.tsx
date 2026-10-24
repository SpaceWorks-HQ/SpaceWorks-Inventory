"use client";

import { useState } from "react";
import Link from "next/link";
import { reverseFinanceEntryAction } from "@/app/actions/finance";
import { useActionRunner } from "@/components/desk/useActionRunner";
import { Button } from "@/components/ui/button";
import { Callout, Chip, EmptyState, SectionHeading } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { FinanceReport } from "@/lib/finance/report";
import { CATEGORY_LABEL, METHOD_LABEL } from "@/lib/finance/labels";
import { formatMoney } from "@/lib/format/money";

/** The ledger itself, newest first, with a link to each entry's source and a reversal for mistakes. */
export function FinanceEntries({ slug, currency, entries }: { slug: string; currency: string; entries: FinanceReport["entries"] }) {
  const [reversing, setReversing] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { run, pending, error } = useActionRunner();
  return (
    <section className="space-y-3">
      <SectionHeading title="Entries" description="Up to 500 of the latest entries in the period. Every entry is in the download." as="h3" />
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {entries.length === 0 ? <EmptyState title="No money moved in this period." /> : (
        <Table label="Ledger entries">
          <THead>
            <tr><TH>Date</TH><TH>Entry</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH><span className="sr-only">Actions</span></TH></tr>
          </THead>
          <TBody>
            {entries.map((entry) => (
              <TR key={entry.id}>
                <TD className="whitespace-nowrap">{entry.day}</TD>
                <TD className="min-w-[200px]">
                  <span className="block font-semibold">{CATEGORY_LABEL[entry.category]}</span>
                  <span className="block text-caption text-ink-muted">
                    {entry.href ? <Link href={entry.href} className="font-semibold text-accent-text underline-offset-4 hover:underline">{entry.source}</Link> : entry.source}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </span>
                  {entry.reversal ? <Chip size="sm" tone="outline">Reversal</Chip> : entry.reversed ? <Chip size="sm" tone="neutral">Reversed</Chip> : null}
                </TD>
                <TD className="text-ink-secondary">{METHOD_LABEL[entry.method]}{entry.reference ? <span className="block text-caption">{entry.reference}</span> : null}</TD>
                <TD className={`whitespace-nowrap text-right font-semibold tabular-nums ${entry.direction === "IN" ? "text-success-fg" : "text-ink"}`}>{entry.direction === "IN" ? "+" : "−"}{formatMoney(entry.amountMinor, currency)}</TD>
                <TD className="text-right">
                  {entry.reversal || entry.reversed ? null : reversing === entry.id ? (
                    <form className="flex min-w-[220px] flex-col items-end gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => reverseFinanceEntryAction(slug, { entryId: entry.id, reason }), "Entry reversed.").then((ok) => ok && setReversing(null)); }}>
                      <Field label="Why" hideLabel><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why it is reversed" required maxLength={500} /></Field>
                      <span className="flex gap-2"><Button size="sm" type="submit" variant="danger" loading={pending}>Reverse</Button><Button size="sm" variant="secondary" onClick={() => setReversing(null)}>Back</Button></span>
                    </form>
                  ) : <Button size="sm" variant="secondary" onClick={() => { setReversing(entry.id); setReason(""); }}>Reverse</Button>}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </section>
  );
}
