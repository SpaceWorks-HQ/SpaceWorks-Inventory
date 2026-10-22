import { describe, expect, it } from "vitest";
import { mapHeaders, normalizeHeader, toRecords } from "@/lib/importer/columns";
import { parseRow, parseTags } from "@/lib/importer/rows";

describe("header mapping", () => {
  it("normalises case, spaces, dashes and underscores", () => {
    expect(normalizeHeader(" Parent_Code ")).toBe("parent code");
    expect(normalizeHeader("PARENT-CODE")).toBe("parent code");
    expect(normalizeHeader("﻿SKU")).toBe("sku");
  });

  it("maps aliases to canonical columns and reports ignored and missing ones", () => {
    const map = mapHeaders("items", ["Item Name", "Part Number", "UOM", "Unit Price", "Colour"]);
    expect(map.indexes).toEqual({ name: 0, sku: 1, unit: 2, unit_cost: 3 });
    expect(map.ignored).toEqual(["Colour"]);
    expect(map.missing).toEqual([]);
    expect(mapHeaders("stock", ["SKU", "Qty"]).missing).toEqual(["location_code"]);
    expect(mapHeaders("locations", ["Location", "Location Code", "Parent"]).indexes).toEqual({ name: 0, code: 1, parent_code: 2 });
  });

  it("keeps the first column when two headers mean the same thing", () => {
    const map = mapHeaders("stock", ["sku", "location", "location code", "quantity"]);
    expect(map.indexes.location_code).toBe(1);
    expect(map.ignored).toEqual(["location code"]);
  });

  it("builds trimmed records keyed by canonical column", () => {
    const map = mapHeaders("categories", ["Category", "Parent Category"]);
    expect(toRecords(map, [[" Hand tools ", ""], ["Pliers"]])).toEqual([{ name: "Hand tools", parent: "" }, { name: "Pliers", parent: "" }]);
  });
});

describe("row checks", () => {
  it("validates locations: required fields, code format and kind", () => {
    expect(parseRow("locations", { name: "Shelf A", code: "elab-sa", kind: "Shelf", parent_code: "elab" }, "INR")).toEqual({
      data: { name: "Shelf A", code: "ELAB-SA", kind: "SHELF", parentCode: "ELAB", description: null },
      errors: [],
    });
    const bad = parseRow("locations", { name: "", code: "has space", kind: "garage" }, "INR");
    expect(bad.data).toBeNull();
    expect(bad.errors).toEqual(expect.arrayContaining(["Name is required.", "Code can use up to 24 letters, digits, dots or dashes.", expect.stringMatching(/^Kind must be one of/)]));
    expect(parseRow("locations", { name: "Room", code: "R1" }, "INR").data?.kind).toBe("OTHER");
  });

  it("validates categories", () => {
    expect(parseRow("categories", { name: "Fasteners", parent: "" }, "INR").data).toEqual({ name: "Fasteners", parent: null, description: null });
    expect(parseRow("categories", { name: "x".repeat(61) }, "INR").errors).toEqual(["Name can be at most 60 characters."]);
  });

  it("validates items: booleans, tracking, numbers and tags", () => {
    const row = parseRow("items", { sku: "ESP32", name: "ESP32 DevKit", tracking: "Serialised", lendable: "Yes", self_checkout: "n", reorder_point: "3", loan_days: "14", tags: "wifi; mcu, wifi" }, "INR");
    expect(row.errors).toEqual([]);
    expect(row.data).toMatchObject({ sku: "ESP32", tracking: "SERIALIZED", lendable: true, selfCheckout: false, consumable: null, reorderPoint: 3, loanDays: 14, tags: ["wifi", "mcu"] });
    const bad = parseRow("items", { sku: "bad sku!", name: "Thing", lendable: "maybe", tracking: "pallet", reorder_point: "-1", loan_days: "2.5" }, "INR");
    expect(bad.errors).toEqual([
      "Tracking must be quantity or serialized.",
      "SKU can use letters, digits, dots, dashes or underscores only.",
      "Reorder point must be a whole number up to 1000000.",
      "Lendable must be yes or no.",
      "Loan days must be a whole number from 1 to 365.",
    ]);
  });

  it("refuses consumable serialized items", () => {
    expect(parseRow("items", { name: "Drill", tracking: "serialized", consumable: "yes" }, "INR").errors).toEqual(["Consumable can't be yes for a serialized item."]);
  });

  it("checks stock quantities and asset dates", () => {
    expect(parseRow("stock", { sku: "RES", location_code: "b1", quantity: "1,200" }, "INR").data).toEqual({ sku: "RES", locationCode: "B1", quantity: 1200, unitCostMinor: null });
    expect(parseRow("stock", { sku: "RES", location_code: "B1", quantity: "0" }, "INR").errors).toEqual(["Quantity must be a whole number from 1 to 1000000."]);
    expect(parseRow("stock", { sku: "", location_code: "", quantity: "" }, "INR").errors).toEqual(["SKU is required.", "Location code is required.", "Quantity is required."]);
    expect(parseRow("assets", { sku: "DMM", location_code: "S1", purchased_at: "2025-02-28" }, "INR").data?.purchasedAt).toBe("2025-02-28");
    expect(parseRow("assets", { sku: "DMM", location_code: "S1", purchased_at: "2025-02-30" }, "INR").errors).toEqual(["Purchased at must be a past date like 2025-03-31."]);
    expect(parseRow("assets", { sku: "DMM", location_code: "S1", purchased_at: "31/03/2025" }, "INR").errors).toHaveLength(1);
  });
});

describe("money conversion", () => {
  it("reads major units in the space currency and returns minor units", () => {
    expect(parseRow("stock", { sku: "A", location_code: "B", quantity: "1", unit_cost: "1,250.50" }, "INR").data?.unitCostMinor).toBe(125050);
    expect(parseRow("stock", { sku: "A", location_code: "B", quantity: "1", unit_cost: "₹ 99" }, "INR").data?.unitCostMinor).toBe(9900);
    expect(parseRow("stock", { sku: "A", location_code: "B", quantity: "1", unit_cost: "1250" }, "JPY").data?.unitCostMinor).toBe(1250);
    expect(parseRow("stock", { sku: "A", location_code: "B", quantity: "1", unit_cost: "1.234" }, "KWD").data?.unitCostMinor).toBe(1234);
  });

  it("refuses amounts with too many decimals, negatives and text", () => {
    for (const [value, currency] of [["12.5", "JPY"], ["1.005", "INR"], ["-4", "INR"], ["free", "INR"], ["2000000", "INR"]]) {
      expect(parseRow("items", { name: "X", unit_cost: value }, currency!).errors, value).toEqual([`Unit cost must be an amount in ${currency} like 1250.50.`]);
    }
  });
});

describe("parseTags", () => {
  it("splits on commas, semicolons and pipes and drops duplicates", () => {
    expect(parseTags("a, b;c | a ;;")).toEqual(["a", "b", "c"]);
  });
});
