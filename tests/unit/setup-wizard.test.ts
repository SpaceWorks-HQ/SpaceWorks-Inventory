import { describe, expect, it } from "vitest";
import { codeFromName, feesForChoice, lendingChoiceOf, locationPlanProblem, planLocations, setupStep, type FeesValues } from "@/lib/setup/wizard";

const fees: FeesValues = {
  depositMode: "NONE", depositMinor: 0, rentalMode: "FREE", rentalMinor: 0, lateFeePerDayMinor: 500, lateFeeCapMinor: 5000, lateFeeGraceDays: 1,
  damageChargeMode: "REPLACEMENT_COST", damageChargeMinor: 0, paymentBeforeIssue: true, payLaterEnabled: true,
};

describe("setup steps", () => {
  it("reads ?step= and falls back to the first step", () => {
    expect(setupStep("3")).toBe(3);
    expect(setupStep(["6"])).toBe(6);
    expect(setupStep("7")).toBe(1);
    expect(setupStep("0")).toBe(1);
    expect(setupStep("x")).toBe(1);
    expect(setupStep(undefined)).toBe(1);
  });
});

describe("location quick builder", () => {
  it("derives short codes from names", () => {
    expect(codeFromName("Main building", "B1")).toBe("MB");
    expect(codeFromName("Lab", "B1")).toBe("LAB");
    expect(codeFromName("  ", "B1")).toBe("B1");
  });

  it("nests rooms, shelves and bins with readable, unique codes", () => {
    const rows = planLocations({ buildingName: "Main building", buildingCode: "", rooms: [{ name: "Workshop", shelves: 2, binsPerShelf: 2 }, { name: "", shelves: 1, binsPerShelf: 0 }] });
    expect(rows.map((row) => row.code)).toEqual(["MB", "MB-R1", "MB-R1-S1", "MB-R1-S1-B1", "MB-R1-S1-B2", "MB-R1-S2", "MB-R1-S2-B1", "MB-R1-S2-B2", "MB-R2", "MB-R2-S1"]);
    expect(rows[8]).toMatchObject({ kind: "ROOM", name: "Room 2", parentKey: "b" });
    expect(rows[3]).toMatchObject({ kind: "BIN", parentKey: "b.r1.s1" });
    expect(locationPlanProblem(rows)).toBeNull();
  });

  it("clamps silly counts and honours a typed building code", () => {
    const rows = planLocations({ buildingName: "Annexe", buildingCode: "an2", rooms: [{ name: "Store", shelves: 99, binsPerShelf: -3 }] });
    expect(rows[0]!.code).toBe("AN2");
    expect(rows.filter((row) => row.kind === "SHELF")).toHaveLength(20);
    expect(rows.some((row) => row.kind === "BIN")).toBe(false);
  });

  it("refuses duplicate codes, bad codes, blank names and children before parents", () => {
    const rows = planLocations({ buildingName: "Main", buildingCode: "M", rooms: [{ name: "Room", shelves: 1, binsPerShelf: 0 }] });
    expect(locationPlanProblem([])).toMatch(/at least one/);
    expect(locationPlanProblem([rows[0]!, { ...rows[1]!, code: "M" }])).toMatch(/used twice/);
    expect(locationPlanProblem([rows[0]!, { ...rows[1]!, code: "bad code!" }])).toMatch(/letters, digits/);
    expect(locationPlanProblem([rows[0]!, { ...rows[1]!, name: " " }])).toMatch(/needs a name/);
    expect(locationPlanProblem([rows[1]!, rows[0]!])).toMatch(/before the place/);
  });
});

describe("lending quick choices", () => {
  it("maps free, deposit and rental onto the fees section and keeps the rest", () => {
    expect(feesForChoice(fees, "free", 999)).toMatchObject({ depositMode: "NONE", rentalMode: "FREE", lateFeePerDayMinor: 0, damageChargeMode: "NONE", payLaterEnabled: true });
    expect(feesForChoice(fees, "deposit", 50000)).toMatchObject({ depositMode: "FIXED", depositMinor: 50000, rentalMode: "FREE", lateFeePerDayMinor: 500 });
    expect(feesForChoice(fees, "rental", 2000)).toMatchObject({ rentalMode: "PER_DAY", rentalMinor: 2000, depositMode: "NONE", depositMinor: 0 });
    expect(feesForChoice(fees, "deposit", -5).depositMinor).toBe(0);
  });

  it("recognises the current choice", () => {
    expect(lendingChoiceOf(fees)).toBe("free");
    expect(lendingChoiceOf({ depositMode: "PER_ITEM", rentalMode: "FREE" })).toBe("deposit");
    expect(lendingChoiceOf({ depositMode: "FIXED", rentalMode: "FLAT" })).toBe("rental");
  });
});
