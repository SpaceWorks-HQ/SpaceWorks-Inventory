"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { addScan, SCAN_KIND_WORD, scanKindOf } from "@/lib/desk/scanCodes";
import { ScanField } from "./ScanField";

type Props = {
  /** Codes scanned so far (bare codes, deduplicated). */
  codes: string[];
  onChange: (codes: string[]) => void;
  /** What this flow expects, code → label ("Drill · TSK-000042"). Codes outside it are flagged. */
  known?: Record<string, string>;
  title?: ReactNode;
  helper?: ReactNode;
  disabled?: boolean;
  max?: number;
};

/**
 * Continuous scanning for desk flows: every label read by the camera or typed
 * is added once to a list the person can check, remove from or clear. The
 * server resolves the codes again when the step is saved.
 */
export function Scanner({ codes, onChange, known, title = "Scanned labels", helper, disabled, max = 300 }: Props) {
  const describe = (code: string) => known?.[code] ?? `${SCAN_KIND_WORD[scanKindOf(code) ?? "item"]} ${code}`;
  return (
    <div className="flex flex-col gap-4">
      <ScanField
        helper={helper}
        disabled={disabled}
        onCode={(code) => {
          if (codes.length >= max && !codes.includes(code)) return { tone: "warning", text: `Scan at most ${max} labels at once.` };
          const next = addScan(codes, code);
          if (!next.added) return { tone: "success", text: `Already scanned: ${describe(code)}.` };
          onChange(next.list);
          if (known && !known[code]) return { tone: "warning", text: `${code} isn't on this list. Check the label; it will be refused when you save.` };
          return { tone: "success", text: `Scanned ${describe(code)}.` };
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-label text-ink">{title} <span className="tabular-nums text-ink-muted">({codes.length})</span></h3>
          {codes.length ? <Button variant="quiet" size="sm" onClick={() => onChange([])} disabled={disabled}>Clear all</Button> : null}
        </div>
        {codes.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-body-ui text-ink-muted">Nothing scanned yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {codes.map((code) => (
              <li key={code} className="flex min-h-12 flex-wrap items-center justify-between gap-2 px-4 py-1.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-body-ui text-ink">{describe(code)}</span>
                  {known && !known[code] ? <Chip tone="danger" size="sm">Not on this list</Chip> : null}
                </span>
                <Button variant="dangerQuiet" size="sm" onClick={() => onChange(codes.filter((c) => c !== code))} disabled={disabled} aria-label={`Remove ${describe(code)}`}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
