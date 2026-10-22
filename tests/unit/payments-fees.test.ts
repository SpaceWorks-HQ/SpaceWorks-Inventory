import { describe, expect, it } from "vitest";
import {
  DAY_MS, daysLate, depositFor, describeDeposit, describeItemFees, describeLateFee, describeRental, incidentChargeFor, incidentChargeKind,
  lateFeeFor, lineRentalFor, loanDays, rentalFor, renewalRentalFor, type FeeLine, type FeeOverrides, type SpaceFeePolicy,
} from "@/lib/payments/fees";

const free: SpaceFeePolicy = {
  depositMode: "NONE", depositMinor: 0, rentalMode: "FREE", rentalMinor: 0,
  lateFeePerDayMinor: 0, lateFeeCapMinor: 0, lateFeeGraceDays: 0, damageChargeMode: "NONE", damageChargeMinor: 0,
};
const none: FeeOverrides = { depositMinor: null, rentalMode: null, rentalMinor: null, lateFeePerDayMinor: null };
const line = (quantity: number, item: Partial<FeeLine["item"]> = {}, category: FeeOverrides | null = null): FeeLine => ({ quantity, item: { ...none, ...item }, category });
const at = (iso: string) => new Date(iso);

describe("loan days", () => {
  it("counts whole days and never less than one", () => {
    expect(loanDays(at("2026-10-01T10:00:00Z"), at("2026-10-08T10:00:00Z"))).toBe(7);
    expect(loanDays(at("2026-10-01T10:00:00Z"), at("2026-10-08T23:59:00Z"))).toBe(7);
    expect(loanDays(at("2026-10-01T10:00:00Z"), at("2026-10-01T18:00:00Z"))).toBe(1);
    expect(loanDays(at("2026-10-05T10:00:00Z"), at("2026-10-01T10:00:00Z"))).toBe(1);
  });
});

describe("deposit", () => {
  it("is nothing when lending is free", () => {
    expect(depositFor(free, [line(2)])).toBe(0);
  });

  it("charges a fixed deposit once per loan", () => {
    const space = { ...free, depositMode: "FIXED" as const, depositMinor: 50_000 };
    expect(depositFor(space, [line(3), line(1)])).toBe(50_000);
    expect(depositFor(space, [])).toBe(0);
  });

  it("charges per item with item, then category, then space amounts", () => {
    const space = { ...free, depositMode: "PER_ITEM" as const, depositMinor: 10_000 };
    const category = { ...none, depositMinor: 20_000 };
    expect(depositFor(space, [line(2)])).toBe(20_000);
    expect(depositFor(space, [line(1, {}, category)])).toBe(20_000);
    expect(depositFor(space, [line(2, { depositMinor: 30_000 }, category)])).toBe(60_000);
    expect(depositFor(space, [line(1, { depositMinor: 0 }, category), line(1)])).toBe(10_000);
  });

  it("skips consumables and empty lines", () => {
    const space = { ...free, depositMode: "PER_ITEM" as const, depositMinor: 10_000 };
    expect(depositFor(space, [line(5, { consumable: true }), line(0)])).toBe(0);
    expect(depositFor({ ...space, depositMode: "FIXED" }, [line(5, { consumable: true })])).toBe(0);
  });
});

describe("rental", () => {
  it("is free by default", () => {
    expect(rentalFor(free, [line(2)], 10)).toBe(0);
  });

  it("charges per day × days × quantity", () => {
    const space = { ...free, rentalMode: "PER_DAY" as const, rentalMinor: 5_000 };
    expect(rentalFor(space, [line(2)], 3)).toBe(30_000);
  });

  it("rounds weeks up", () => {
    const space = { ...free, rentalMode: "PER_WEEK" as const, rentalMinor: 30_000 };
    expect(rentalFor(space, [line(1)], 7)).toBe(30_000);
    expect(rentalFor(space, [line(1)], 8)).toBe(60_000);
    expect(rentalFor(space, [line(2)], 1)).toBe(60_000);
  });

  it("charges a flat amount per unit whatever the length", () => {
    const space = { ...free, rentalMode: "FLAT" as const, rentalMinor: 10_000 };
    expect(rentalFor(space, [line(3)], 30)).toBe(30_000);
  });

  it("lets a category and an item override the mode and amount", () => {
    const space = { ...free, rentalMode: "PER_DAY" as const, rentalMinor: 1_000 };
    const category = { ...none, rentalMode: "FLAT" as const, rentalMinor: 7_000 };
    expect(lineRentalFor(space, line(1, {}, category), 5)).toBe(7_000);
    expect(lineRentalFor(space, line(1, { rentalMode: "FREE" }, category), 5)).toBe(0);
    expect(lineRentalFor(space, line(1, { rentalMinor: 2_000 }, category), 5)).toBe(2_000);
    expect(lineRentalFor(space, line(1, { rentalMode: "PER_WEEK" }, null), 9)).toBe(2_000);
    expect(lineRentalFor(space, line(4, { consumable: true }), 9)).toBe(0);
  });

  it("charges renewals only for time-based modes", () => {
    const perDay = { ...free, rentalMode: "PER_DAY" as const, rentalMinor: 1_000 };
    expect(renewalRentalFor(perDay, [line(2)], 7, 14)).toBe(14_000);
    const perWeek = { ...free, rentalMode: "PER_WEEK" as const, rentalMinor: 5_000 };
    expect(renewalRentalFor(perWeek, [line(1)], 7, 14)).toBe(5_000);
    expect(renewalRentalFor(perWeek, [line(1)], 8, 10)).toBe(0);
    expect(renewalRentalFor({ ...free, rentalMode: "FLAT", rentalMinor: 9_000 }, [line(1)], 7, 14)).toBe(0);
  });
});

describe("late fee", () => {
  const due = at("2026-10-10T18:00:00Z");
  const space = { ...free, lateFeePerDayMinor: 2_000 };

  it("is nothing when returned on time", () => {
    expect(lateFeeFor(space, [line(1)], due, at("2026-10-10T17:00:00Z")).amountMinor).toBe(0);
  });

  it("counts part days as a day", () => {
    expect(daysLate(due, at("2026-10-10T19:00:00Z"), 0)).toBe(1);
    expect(lateFeeFor(space, [line(1)], due, new Date(due.getTime() + 2 * DAY_MS + 1)).amountMinor).toBe(6_000);
  });

  it("applies the grace period", () => {
    const graced = { ...space, lateFeeGraceDays: 2 };
    expect(lateFeeFor(graced, [line(1)], due, new Date(due.getTime() + 2 * DAY_MS)).amountMinor).toBe(0);
    expect(lateFeeFor(graced, [line(1)], due, new Date(due.getTime() + 5 * DAY_MS)).amountMinor).toBe(6_000);
  });

  it("caps the fee when a cap is set", () => {
    const capped = { ...space, lateFeeCapMinor: 5_000 };
    expect(lateFeeFor(capped, [line(1)], due, new Date(due.getTime() + 10 * DAY_MS)).amountMinor).toBe(5_000);
  });

  it("uses the highest per-day rate across lines, with overrides", () => {
    const category = { ...none, lateFeePerDayMinor: 3_000 };
    const fee = lateFeeFor(space, [line(1), line(1, {}, category), line(1, { lateFeePerDayMinor: 500 }, category)], due, new Date(due.getTime() + DAY_MS));
    expect(fee).toEqual({ amountMinor: 3_000, daysLate: 1, perDayMinor: 3_000 });
    expect(lateFeeFor(space, [line(1, { consumable: true, lateFeePerDayMinor: 9_000 })], due, new Date(due.getTime() + DAY_MS)).amountMinor).toBe(0);
  });
});

describe("damage and loss", () => {
  const item = { replacementMinor: 120_000, unitCostMinor: 80_000 };

  it("charges nothing when the space doesn't", () => {
    expect(incidentChargeFor(free, item, 1)).toBe(0);
  });

  it("charges the replacement cost, else the unit cost", () => {
    const space = { ...free, damageChargeMode: "REPLACEMENT_COST" as const };
    expect(incidentChargeFor(space, item, 2)).toBe(240_000);
    expect(incidentChargeFor(space, { replacementMinor: null, unitCostMinor: 80_000 }, 1)).toBe(80_000);
  });

  it("charges a fixed amount per unit", () => {
    const space = { ...free, damageChargeMode: "FIXED" as const, damageChargeMinor: 25_000 };
    expect(incidentChargeFor(space, item, 3)).toBe(75_000);
    expect(incidentChargeFor(space, item, 0)).toBe(0);
  });

  it("maps incident kinds to charge kinds", () => {
    expect(incidentChargeKind("LOST")).toBe("LOSS");
    expect(incidentChargeKind("DAMAGED")).toBe("DAMAGE");
  });
});

describe("policy in words", () => {
  it("describes rental, deposit and late fees", () => {
    expect(describeRental("FREE", 5_000, "INR")).toBe("Free");
    expect(describeRental("PER_DAY", 5_000, "INR")).toBe("₹50.00 per day");
    expect(describeRental("FLAT", 10_000, "INR")).toBe("₹100.00 flat");
    expect(describeDeposit("NONE", 50_000, "INR")).toBe("No deposit");
    expect(describeDeposit("FIXED", 50_000, "INR")).toBe("₹500.00 refundable deposit");
    expect(describeDeposit("PER_ITEM", 50_000, "INR")).toBe("₹500.00 refundable deposit per item");
    expect(describeLateFee({ lateFeeCapMinor: 50_000, lateFeeGraceDays: 2 }, 2_000, "INR")).toBe("₹20.00 per day late after 2 days, up to ₹500.00");
    expect(describeLateFee({ lateFeeCapMinor: 0, lateFeeGraceDays: 0 }, 0, "INR")).toBe("No late fee");
  });

  it("describes one item's fees", () => {
    expect(describeItemFees(free, { ...none }, null, "INR")).toEqual(["Free"]);
    const space = { ...free, depositMode: "PER_ITEM" as const, depositMinor: 50_000, rentalMode: "PER_DAY" as const, rentalMinor: 5_000 };
    expect(describeItemFees(space, { ...none }, null, "INR")).toEqual(["₹50.00 per day", "₹500.00 refundable deposit"]);
    expect(describeItemFees(space, { ...none, consumable: true }, null, "INR")).toEqual(["Free"]);
  });
});
