import type { ChargeKind, DamageChargeMode, DepositMode, IncidentKind, RentalMode } from "@prisma/client";
import { formatMoney } from "@/lib/format/money";

/**
 * Lending fee arithmetic (pure and client-safe). Money is integer minor
 * units. Overrides resolve item → category → space; null means inherit.
 * Consumable lines never carry deposit, rental or late fees: they are used
 * up at issue and never come back.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export type SpaceFeePolicy = {
  depositMode: DepositMode;
  depositMinor: number;
  rentalMode: RentalMode;
  rentalMinor: number;
  lateFeePerDayMinor: number;
  lateFeeCapMinor: number;
  lateFeeGraceDays: number;
  damageChargeMode: DamageChargeMode;
  damageChargeMinor: number;
};

export type FeeOverrides = {
  depositMinor: number | null;
  rentalMode: RentalMode | null;
  rentalMinor: number | null;
  lateFeePerDayMinor: number | null;
};

export type FeeItem = FeeOverrides & { consumable?: boolean; replacementMinor?: number | null; unitCostMinor?: number };

export type FeeLine = { quantity: number; item: FeeItem; category: FeeOverrides | null };

/** Whole days between the start (issue, or now before issue) and the due date; at least 1. */
export function loanDays(start: Date, dueAt: Date): number {
  return Math.max(1, Math.floor((dueAt.getTime() - start.getTime()) / DAY_MS));
}

const chargeable = (line: FeeLine) => line.quantity > 0 && !line.item.consumable;

export function effectiveDepositMinor(space: SpaceFeePolicy, item: FeeOverrides, category: FeeOverrides | null) {
  return item.depositMinor ?? category?.depositMinor ?? space.depositMinor;
}

export function effectiveRental(space: SpaceFeePolicy, item: FeeOverrides, category: FeeOverrides | null): { mode: RentalMode; amountMinor: number } {
  return {
    mode: item.rentalMode ?? category?.rentalMode ?? space.rentalMode,
    amountMinor: item.rentalMinor ?? category?.rentalMinor ?? space.rentalMinor,
  };
}

export function effectiveLateFeePerDay(space: SpaceFeePolicy, item: FeeOverrides, category: FeeOverrides | null) {
  return item.lateFeePerDayMinor ?? category?.lateFeePerDayMinor ?? space.lateFeePerDayMinor;
}

/** Refundable deposit for a loan: none, once per loan, or per unit with overrides. */
export function depositFor(space: SpaceFeePolicy, lines: FeeLine[]): number {
  const units = lines.filter(chargeable);
  if (space.depositMode === "NONE" || units.length === 0) return 0;
  if (space.depositMode === "FIXED") return Math.max(0, space.depositMinor);
  return units.reduce((sum, line) => sum + Math.max(0, effectiveDepositMinor(space, line.item, line.category)) * line.quantity, 0);
}

/** Rental for one line over `days` days. */
export function lineRentalFor(space: SpaceFeePolicy, line: FeeLine, days: number): number {
  if (!chargeable(line)) return 0;
  const { mode, amountMinor } = effectiveRental(space, line.item, line.category);
  const amount = Math.max(0, amountMinor);
  switch (mode) {
    case "FREE":
      return 0;
    case "PER_DAY":
      return amount * days * line.quantity;
    case "PER_WEEK":
      return amount * Math.ceil(days / 7) * line.quantity;
    case "FLAT":
      return amount * line.quantity;
  }
}

export function rentalFor(space: SpaceFeePolicy, lines: FeeLine[], days: number): number {
  return lines.reduce((sum, line) => sum + lineRentalFor(space, line, days), 0);
}

/**
 * Rental for extending a loan from `oldDays` to `newDays`. Only time-based
 * modes charge: a flat or free rental is not charged again.
 */
export function renewalRentalFor(space: SpaceFeePolicy, lines: FeeLine[], oldDays: number, newDays: number): number {
  return lines.reduce((sum, line) => {
    if (!chargeable(line)) return sum;
    const { mode, amountMinor } = effectiveRental(space, line.item, line.category);
    const amount = Math.max(0, amountMinor);
    if (mode === "PER_DAY") return sum + amount * Math.max(0, newDays - oldDays) * line.quantity;
    if (mode === "PER_WEEK") return sum + amount * Math.max(0, Math.ceil(newDays / 7) - Math.ceil(oldDays / 7)) * line.quantity;
    return sum;
  }, 0);
}

/** Whole days late after the grace period (part days count as a day). */
export function daysLate(dueAt: Date, returnedAt: Date, graceDays: number): number {
  const late = Math.ceil((returnedAt.getTime() - dueAt.getTime()) / DAY_MS);
  return Math.max(0, late - Math.max(0, graceDays));
}

/** Late fee: the highest per-day rate across the loan's lines × days late, capped when a cap is set. */
export function lateFeeFor(space: SpaceFeePolicy, lines: FeeLine[], dueAt: Date, returnedAt: Date): { amountMinor: number; daysLate: number; perDayMinor: number } {
  const perDay = lines.filter(chargeable).reduce((max, line) => Math.max(max, effectiveLateFeePerDay(space, line.item, line.category)), 0);
  const days = daysLate(dueAt, returnedAt, space.lateFeeGraceDays);
  const raw = perDay * days;
  const amountMinor = space.lateFeeCapMinor > 0 ? Math.min(raw, space.lateFeeCapMinor) : raw;
  return { amountMinor: Math.max(0, amountMinor), daysLate: days, perDayMinor: perDay };
}

/** Charge for a lost or damaged incident. */
export function incidentChargeFor(space: SpaceFeePolicy, item: { replacementMinor: number | null; unitCostMinor: number }, quantity: number): number {
  if (quantity <= 0) return 0;
  switch (space.damageChargeMode) {
    case "NONE":
      return 0;
    case "REPLACEMENT_COST":
      return Math.max(0, item.replacementMinor ?? item.unitCostMinor) * quantity;
    case "FIXED":
      return Math.max(0, space.damageChargeMinor) * quantity;
  }
}

export function incidentChargeKind(kind: IncidentKind): ChargeKind {
  return kind === "LOST" ? "LOSS" : "DAMAGE";
}

// ───────────── Words for the UI ─────────────

export const CHARGE_KIND_LABEL: Record<ChargeKind, string> = {
  DEPOSIT: "Refundable deposit",
  RENTAL: "Rental",
  LATE_FEE: "Late fee",
  DAMAGE: "Damage charge",
  LOSS: "Replacement charge",
};

const RENTAL_UNIT: Record<Exclude<RentalMode, "FREE">, string> = { PER_DAY: "per day", PER_WEEK: "per week", FLAT: "flat" };

/** "Free", "₹50 per day", "₹300 per week", "₹100 flat". */
export function describeRental(mode: RentalMode, amountMinor: number, currency: string): string {
  if (mode === "FREE" || amountMinor <= 0) return "Free";
  return `${formatMoney(amountMinor, currency)} ${RENTAL_UNIT[mode]}`;
}

/** "No deposit", "₹500 refundable deposit", "₹500 refundable deposit per item". */
export function describeDeposit(mode: DepositMode, amountMinor: number, currency: string): string {
  if (mode === "NONE" || amountMinor <= 0) return "No deposit";
  return `${formatMoney(amountMinor, currency)} refundable deposit${mode === "PER_ITEM" ? " per item" : ""}`;
}

/** "No late fee", "₹20 per day late after 2 days, up to ₹500". */
export function describeLateFee(space: Pick<SpaceFeePolicy, "lateFeeCapMinor" | "lateFeeGraceDays">, perDayMinor: number, currency: string): string {
  if (perDayMinor <= 0) return "No late fee";
  const grace = space.lateFeeGraceDays > 0 ? ` after ${space.lateFeeGraceDays} day${space.lateFeeGraceDays === 1 ? "" : "s"}` : "";
  const cap = space.lateFeeCapMinor > 0 ? `, up to ${formatMoney(space.lateFeeCapMinor, currency)}` : "";
  return `${formatMoney(perDayMinor, currency)} per day late${grace}${cap}`;
}

/** What borrowing one item costs, in short phrases: ["Free"] or ["₹50 per day", "₹500 refundable deposit"]. */
export function describeItemFees(space: SpaceFeePolicy, item: FeeItem, category: FeeOverrides | null, currency: string): string[] {
  if (item.consumable) return ["Free"];
  const parts: string[] = [];
  const rental = effectiveRental(space, item, category);
  if (rental.mode !== "FREE" && rental.amountMinor > 0) parts.push(describeRental(rental.mode, rental.amountMinor, currency));
  const deposit = space.depositMode === "PER_ITEM" ? effectiveDepositMinor(space, item, category) : space.depositMode === "FIXED" ? space.depositMinor : 0;
  if (deposit > 0) parts.push(describeDeposit(space.depositMode === "PER_ITEM" ? "PER_ITEM" : "FIXED", deposit, currency).replace(" per item", ""));
  return parts.length ? parts : ["Free"];
}

/** Is lending in this space free of every fee? */
export function isFreeLending(space: SpaceFeePolicy): boolean {
  return space.depositMode === "NONE" && space.rentalMode === "FREE" && space.lateFeePerDayMinor <= 0 && space.damageChargeMode === "NONE";
}
