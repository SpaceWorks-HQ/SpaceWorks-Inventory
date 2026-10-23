import { describe, expect, it } from "vitest";
import { SECTION_DESCRIPTIONS, SETTINGS_FIELDS } from "@/components/settings/settingsFields";
import { fromFormState, optionalMoney, optionalWhole, toFormState } from "@/components/settings/settingsForm";
import { treeOrder } from "@/components/settings/taxonomyTree";
import { SETTINGS_SECTION_KEYS, SETTINGS_SECTIONS } from "@/lib/settings/sections";

describe("settings copy map", () => {
  it.each(SETTINGS_SECTION_KEYS)("describes every field of the %s section, and nothing else", (section) => {
    const schemaKeys = Object.keys(SETTINGS_SECTIONS[section].schema.shape).sort();
    const described = SETTINGS_FIELDS[section].map((field) => field.key).sort();
    expect(described).toEqual(schemaKeys);
    expect(SECTION_DESCRIPTIONS[section].length).toBeGreaterThan(10);
    for (const field of SETTINGS_FIELDS[section]) {
      expect(field.help.length, `${section}.${field.key}`).toBeGreaterThan(15);
      expect(field.help, `${section}.${field.key}`).not.toMatch(/Oops|Something went wrong/i);
      if (field.kind === "choice") expect(field.options?.length).toBeGreaterThan(1);
    }
  });

  it("offers every enum value of the choice fields", () => {
    const fees = SETTINGS_FIELDS.fees;
    expect(fees.find((f) => f.key === "depositMode")?.options?.map((o) => o.value)).toEqual(["NONE", "FIXED", "PER_ITEM"]);
    expect(fees.find((f) => f.key === "rentalMode")?.options?.map((o) => o.value)).toEqual(["FREE", "PER_DAY", "PER_WEEK", "FLAT"]);
    expect(SETTINGS_FIELDS.inventory.find((f) => f.key === "labelSize")?.options?.map((o) => o.value)).toEqual(["SMALL", "MEDIUM", "LARGE"]);
  });
});

describe("settings form conversion", () => {
  const fees = SETTINGS_FIELDS.fees;
  const stored = {
    depositMode: "FIXED", depositMinor: 50_000, rentalMode: "FREE", rentalMinor: 0, lateFeePerDayMinor: 1_050, lateFeeCapMinor: 0,
    lateFeeGraceDays: 2, damageChargeMode: "NONE", damageChargeMinor: 0, paymentBeforeIssue: true, payLaterEnabled: false,
  };

  it("shows money in major units and round-trips to minor units", () => {
    const form = toFormState(fees, stored, 2);
    expect(form.depositMinor).toBe("500.00");
    expect(form.lateFeePerDayMinor).toBe("10.50");
    expect(form.paymentBeforeIssue).toBe(true);
    const back = fromFormState(fees, form, 2);
    expect(back.errors).toEqual({});
    expect(back.values).toEqual(stored);
    expect(SETTINGS_SECTIONS.fees.schema.safeParse(back.values).success).toBe(true);
  });

  it("uses the currency's minor digits", () => {
    const form = toFormState(fees, { ...stored, depositMinor: 500 }, 0);
    expect(form.depositMinor).toBe("500");
    expect(fromFormState(fees, { ...form, depositMinor: "12.5" }, 0).errors.depositMinor).toBeTruthy();
  });

  it("flags bad numbers and keeps blank optional numbers as null", () => {
    const inventory = SETTINGS_FIELDS.inventory;
    const form = toFormState(inventory, { internalTransferApproval: true, labelSize: "MEDIUM", labelShowName: true, labelShowLocation: false, defaultReorderPoint: null, countVarianceThreshold: 4 }, 2);
    expect(form.defaultReorderPoint).toBe("");
    const ok = fromFormState(inventory, form, 2);
    expect(ok.values.defaultReorderPoint).toBeNull();
    expect(ok.values.countVarianceThreshold).toBe(4);
    const bad = fromFormState(SETTINGS_FIELDS.lending, { ...toFormState(SETTINGS_FIELDS.lending, {}, 2), defaultLoanDays: "1.5", maxLoanDays: "" }, 2);
    expect(bad.errors.defaultLoanDays).toBe("Enter a whole number.");
    expect(bad.errors.maxLoanDays).toBe("Enter a number.");
    expect(fromFormState(fees, { ...toFormState(fees, stored, 2), depositMinor: "abc" }, 2).errors.depositMinor).toBeTruthy();
  });

  it("parses optional overrides (blank inherits)", () => {
    expect(optionalMoney("", 2)).toBeNull();
    expect(optionalMoney("12.5", 2)).toBe(1250);
    expect(optionalMoney("x", 2)).toBeNaN();
    expect(optionalWhole(" ")).toBeNull();
    expect(optionalWhole("14")).toBe(14);
    expect(optionalWhole("1.5")).toBeNaN();
  });
});

describe("category tree order", () => {
  it("lists parents before their children, alphabetically, with depth", () => {
    const rows = [
      { id: "c", parentId: "a", name: "Drills" },
      { id: "a", parentId: null, name: "Power tools" },
      { id: "b", parentId: null, name: "Electronics" },
      { id: "d", parentId: "a", name: "Saws" },
      { id: "e", parentId: "missing", name: "Orphan" },
    ];
    expect(treeOrder(rows).map((row) => `${row.depth}:${row.name}`)).toEqual(["0:Electronics", "0:Orphan", "0:Power tools", "1:Drills", "1:Saws"]);
  });

  it("never drops rows caught in a cycle", () => {
    const rows = [{ id: "a", parentId: "b", name: "A" }, { id: "b", parentId: "a", name: "B" }];
    expect(treeOrder(rows)).toHaveLength(2);
  });
});
