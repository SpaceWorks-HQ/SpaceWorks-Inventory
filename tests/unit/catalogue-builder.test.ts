import { describe, expect, it } from "vitest";
import { builderSchema, nextBuildingCode, planHierarchy } from "@/lib/catalogue/builder";

describe("location quick builder", () => {
  it("picks the next free building number", () => {
    expect(nextBuildingCode([])).toBe("B1");
    expect(nextBuildingCode(["B1", "B3", "B1-R1", "BIN-4", "b7"])).toBe("B8");
    expect(nextBuildingCode(["R1", "SHELF"])).toBe("B1");
  });

  it("plans a building, its rooms and their shelves with generated codes, parents first", () => {
    const plan = planHierarchy({ buildingName: "Workshop", buildingCode: "B2", rooms: 2, shelvesPerRoom: 3 });
    expect(plan).toHaveLength(1 + 2 + 6);
    expect(plan[0]).toEqual({ code: "B2", name: "Workshop", kind: "BUILDING", parentCode: null });
    expect(plan[1]).toEqual({ code: "B2-R1", name: "Room 1", kind: "ROOM", parentCode: "B2" });
    expect(plan[2]).toEqual({ code: "B2-R1-S1", name: "Shelf 1", kind: "SHELF", parentCode: "B2-R1" });
    expect(plan.at(-1)).toEqual({ code: "B2-R2-S3", name: "Shelf 3", kind: "SHELF", parentCode: "B2-R2" });
    const seen = new Set<string>();
    for (const row of plan) {
      if (row.parentCode) expect(seen.has(row.parentCode)).toBe(true);
      seen.add(row.code);
    }
    expect(seen.size).toBe(plan.length);
  });

  it("plans rooms without shelves", () => {
    expect(planHierarchy({ buildingName: "Shed", buildingCode: "SHED", rooms: 1, shelvesPerRoom: 0 }).map((row) => row.code)).toEqual(["SHED", "SHED-R1"]);
  });

  it("validates sizes and codes", () => {
    expect(builderSchema.safeParse({ buildingName: "Main", rooms: 2, shelvesPerRoom: 4 }).success).toBe(true);
    expect(builderSchema.parse({ buildingName: "Main", buildingCode: " b9 ", rooms: 1, shelvesPerRoom: 0 }).buildingCode).toBe("B9");
    expect(builderSchema.safeParse({ buildingName: "Main", rooms: 0, shelvesPerRoom: 1 }).success).toBe(false);
    expect(builderSchema.safeParse({ buildingName: "Main", rooms: 50, shelvesPerRoom: 10 }).success).toBe(false);
    expect(builderSchema.safeParse({ buildingName: "Main", buildingCode: "B-1", rooms: 1, shelvesPerRoom: 1 }).success).toBe(false);
    expect(builderSchema.safeParse({ buildingName: " ", rooms: 1, shelvesPerRoom: 1 }).success).toBe(false);
  });
});
