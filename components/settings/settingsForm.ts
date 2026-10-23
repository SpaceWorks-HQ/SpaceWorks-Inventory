import { moneyInputValue, parseMoneyInput } from "@/lib/format/quantity";
import type { FieldSpec, FormState } from "./settingsFields";

/**
 * Convert between stored section values (money in minor units, nullable
 * numbers) and form state (strings and booleans, money in major units).
 * Pure and client-safe.
 */
export type StoredValue = string | number | boolean | null;

export function toFormState(fields: readonly FieldSpec[], values: Record<string, StoredValue>, minorDigits: number): FormState {
  const form: FormState = {};
  for (const field of fields) {
    const value = values[field.key];
    if (field.kind === "switch") form[field.key] = value === true;
    else if (field.kind === "money") form[field.key] = typeof value === "number" ? moneyInputValue(value, minorDigits) : "";
    else form[field.key] = value === null || value === undefined ? "" : String(value);
  }
  return form;
}

/** Form state back to section values, or per-field errors for numbers and amounts that don't parse. */
export function fromFormState(fields: readonly FieldSpec[], form: FormState, minorDigits: number): { values: Record<string, StoredValue>; errors: Record<string, string> } {
  const values: Record<string, StoredValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const raw = form[field.key];
    if (field.kind === "switch") {
      values[field.key] = raw === true;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (field.kind === "number" || field.kind === "optionalNumber") {
      if (text === "") {
        if (field.kind === "optionalNumber") values[field.key] = null;
        else errors[field.key] = "Enter a number.";
      } else if (!/^\d+$/.test(text)) {
        errors[field.key] = "Enter a whole number.";
      } else {
        values[field.key] = Number(text);
      }
    } else if (field.kind === "money") {
      const minor = parseMoneyInput(text === "" ? "0" : text, minorDigits);
      if (minor === null || Number.isNaN(minor)) errors[field.key] = minorDigits > 0 ? "Enter an amount like 250 or 99.50." : "Enter a whole amount like 250.";
      else values[field.key] = minor;
    } else {
      values[field.key] = typeof raw === "string" ? raw : "";
    }
  }
  return { values, errors };
}

/** Optional money field (blank = inherit) to minor units: null, a number, or NaN when it doesn't parse. */
export function optionalMoney(text: string, minorDigits: number): number | null {
  return parseMoneyInput(text, minorDigits);
}

/** Optional whole number (blank = inherit): null, a number, or NaN. */
export function optionalWhole(text: string): number | null {
  const value = text.trim();
  if (!value) return null;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}
