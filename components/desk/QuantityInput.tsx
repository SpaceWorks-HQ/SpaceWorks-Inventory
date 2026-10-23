"use client";

import { Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";

/** Fast numeric entry for counts and handovers: whole numbers between min and max. */
export function QuantityInput({ value, onChange, max, min = 0, label, className, disabled }: {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  min?: number;
  /** Accessible name, e.g. "Received of Servo motor". */
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={label}
      value={String(value)}
      disabled={disabled}
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 7);
        const next = digits ? Number(digits) : 0;
        onChange(Math.max(min, max === undefined ? next : Math.min(max, next)));
      }}
      className={cn("w-24 text-right tabular-nums", className)}
    />
  );
}
