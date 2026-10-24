import { describe, expect, it } from "vitest";
import { nextDay, pageOf, parseItemFilters, parseMovementFilters } from "@/lib/catalogue/views";

describe("catalogue read-model filters", () => {
  it("parses item filters and ignores unknown values", () => {
    expect(parseItemFilters({ q: "  drill ", category: "c1", tracking: "SERIALIZED", lendable: "yes", low: "1", page: "3" }))
      .toEqual({ q: "drill", categoryId: "c1", tracking: "SERIALIZED", lendable: "yes", low: true, archived: false, page: 3 });
    expect(parseItemFilters({ tracking: "BOTH", lendable: "maybe", low: "on", page: "-2", q: ["a", "b"] }))
      .toMatchObject({ q: "a", tracking: "", lendable: "", low: false, page: 1 });
  });

  it("clamps pages", () => {
    expect(pageOf({})).toBe(1);
    expect(pageOf({ page: "abc" })).toBe(1);
    expect(pageOf({ page: "999999" })).toBe(10_000);
  });

  it("parses ledger filters with valid dates and movement types only", () => {
    expect(parseMovementFilters({ type: "RECEIPT", item: "i1", from: "2026-10-01", to: "2026-10-23", ref: "LN-0042" }))
      .toEqual({ type: "RECEIPT", itemId: "i1", assetId: "", q: "", from: "2026-10-01", to: "2026-10-23", ref: "LN-0042", page: 1 });
    expect(parseMovementFilters({ type: "DROP TABLE", from: "01/10/2026", to: "2026-1-1" })).toMatchObject({ type: "", from: "", to: "" });
  });

  it("finds the next calendar day across month and year ends", () => {
    expect(nextDay("2026-10-23")).toBe("2026-10-24");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
