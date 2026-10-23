import { describe, expect, it } from "vitest";
import { emptyItemValues, itemPayload, itemValuesFrom, parseTags } from "@/components/catalogue/itemFormModel";
import { signed, withParams } from "@/components/catalogue/words";
import { itemSchema } from "@/lib/catalogue/schemas";

describe("item form model", () => {
  it("parses tags, dropping blanks and case-insensitive duplicates", () => {
    expect(parseTags(" pla, 3D printing,,PLA , filament")).toEqual(["pla", "3D printing", "filament"]);
  });

  it("converts major-unit money and whole numbers into a valid itemSchema payload", () => {
    const values = { ...emptyItemValues(), name: "Soldering iron", unitCost: "1,250.50", reorderPoint: "2", lendable: true, deposit: "500", rentalMode: "PER_DAY" as const, rental: "20", lateFee: "10.5", loanDays: "7", tags: "electronics" };
    const result = itemPayload(values, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({ unitCostMinor: 125050, reorderPoint: 2, depositMinor: 50000, rentalMode: "PER_DAY", rentalMinor: 2000, lateFeePerDayMinor: 1050, loanDays: 7, tags: ["electronics"] });
    expect(itemSchema.safeParse(result.payload).success).toBe(true);
  });

  it("drops lending overrides when the item isn't lendable and never sends consumable for serialized items", () => {
    const result = itemPayload({ ...emptyItemValues(), name: "Laptop", tracking: "SERIALIZED", consumable: true, deposit: "100", selfCheckout: true }, 2);
    expect(result.ok && result.payload).toMatchObject({ consumable: false, depositMinor: null, selfCheckout: false, rentalMode: null });
    if (result.ok) expect(itemSchema.safeParse(result.payload).success).toBe(true);
  });

  it("explains bad fields instead of sending them", () => {
    const result = itemPayload({ ...emptyItemValues(), name: "", unitCost: "12.345", reorderPoint: "two" }, 2);
    expect(result).toEqual({ ok: false, errors: { name: "Enter a name.", unitCost: "Enter an amount like 12.50.", reorderPoint: "Use a whole number." } });
    expect(itemPayload({ ...emptyItemValues(), name: "Washer", unitCost: "1.5" }, 0)).toEqual({ ok: false, errors: { unitCost: "Enter a whole amount." } });
  });

  it("round-trips a stored item through the form", () => {
    const stored = {
      name: "Drill", sku: "DRILL", description: null, categoryId: "c1", unitId: null, supplierId: null, tracking: "QUANTITY" as const, barcode: null, brand: "Bosch", model: null, tags: ["power", "tools"],
      unitCostMinor: 450000, reorderPoint: 1, reorderQuantity: null, lendable: true, consumable: false, selfCheckout: false, requiresApproval: true,
      loanDays: null, replacementMinor: 500000, depositMinor: 100000, rentalMode: "FLAT" as const, rentalMinor: 5000, lateFeePerDayMinor: null, notes: null,
    };
    const values = itemValuesFrom(stored, 2);
    expect(values).toMatchObject({ unitCost: "4500.00", tags: "power, tools", deposit: "1000.00", rental: "50.00", lateFee: "", reorderPoint: "1" });
    const result = itemPayload(values, 2);
    expect(result.ok && result.payload).toMatchObject({ unitCostMinor: 450000, replacementMinor: 500000, depositMinor: 100000, rentalMode: "FLAT", rentalMinor: 5000, lateFeePerDayMinor: null, categoryId: "c1" });
  });
});

describe("list helpers", () => {
  it("signs changes with a real minus", () => {
    expect([signed(3), signed(-2), signed(0)]).toEqual(["+3", "−2", "0"]);
  });

  it("builds links that keep only set filters", () => {
    expect(withParams("/s/x/items", { q: "drill bit", low: true, archived: false, page: null, category: "" })).toBe("/s/x/items?q=drill+bit&low=1");
    expect(withParams("/s/x/items", {})).toBe("/s/x/items");
  });
});
