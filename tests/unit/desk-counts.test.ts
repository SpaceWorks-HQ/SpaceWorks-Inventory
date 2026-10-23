import { describe, expect, it } from "vitest";
import { countFilterFrom, fourEyes, groupByLocation, isStale, lineVariance, scopeWords, showsExpected, statusesFor } from "@/lib/desk/countsLogic";
import { addCountLineSchema, recordCountSchema, scheduleSchema, startCountSchema } from "@/lib/desk/countSchemas";

const quantity = { tracking: "QUANTITY" as const, expectedQty: 10, countedQty: null as number | null, onHand: 10, availableAssets: 0, scannedAssets: 0 };

describe("count variances", () => {
  it("leaves uncounted quantity lines without a variance", () => {
    expect(lineVariance(quantity)).toEqual({ expected: 10, variance: 0, counted: false });
    expect(lineVariance({ ...quantity, countedQty: 7 })).toEqual({ expected: 10, variance: -3, counted: true });
    expect(lineVariance({ ...quantity, countedQty: 12 }).variance).toBe(2);
  });

  it("compares scanned tags with the assets available at the shelf", () => {
    expect(lineVariance({ ...quantity, tracking: "SERIALIZED", availableAssets: 3, scannedAssets: 2 })).toEqual({ expected: 3, variance: -1, counted: true });
  });

  it("flags quantity lines whose stock moved since the snapshot", () => {
    expect(isStale({ tracking: "QUANTITY", expectedQty: 10, onHand: 11 })).toBe(true);
    expect(isStale({ tracking: "QUANTITY", expectedQty: 10, onHand: 10 })).toBe(false);
    expect(isStale({ tracking: "SERIALIZED", expectedQty: 0, onHand: 4 })).toBe(false);
  });
});

describe("blind counts and four-eyes", () => {
  it("hides expected quantities only while a blind count is open", () => {
    expect(showsExpected({ blind: true, status: "IN_PROGRESS" })).toBe(false);
    expect(showsExpected({ blind: true, status: "SUBMITTED" })).toBe(true);
    expect(showsExpected({ blind: false, status: "IN_PROGRESS" })).toBe(true);
  });

  it("blocks people who started or counted when a variance is above the threshold", () => {
    const base = { variances: [0, -3], threshold: 2, viewerId: "u1", startedById: "u2", counterIds: ["u1", null] };
    expect(fourEyes(base)).toEqual({ overThreshold: true, involved: true, blocked: true });
    expect(fourEyes({ ...base, viewerId: "u3" }).blocked).toBe(false);
    expect(fourEyes({ ...base, threshold: 3 }).blocked).toBe(false);
    expect(fourEyes({ ...base, threshold: null, variances: [1], viewerId: "u2" }).blocked).toBe(true);
  });
});

describe("count list helpers", () => {
  it("reads filters and scopes", () => {
    expect(countFilterFrom("posted")).toBe("posted");
    expect(countFilterFrom("nonsense")).toBe("open");
    expect(statusesFor("all")).toBeNull();
    expect(statusesFor("open")).toEqual(["IN_PROGRESS"]);
    expect(scopeWords({ locationPath: null, categoryName: null })).toBe("Whole space");
    expect(scopeWords({ locationPath: "Room › Shelf A", categoryName: "Tools" })).toBe("Room › Shelf A and below · Tools");
  });

  it("groups lines by location path in order", () => {
    const groups = groupByLocation([{ id: 1, locationPath: "B" }, { id: 2, locationPath: "A" }, { id: 3, locationPath: "B" }]);
    expect(groups.map((g) => [g.locationPath, g.lines.map((l) => l.id)])).toEqual([["A", [2]], ["B", [1, 3]]]);
  });
});

describe("count schemas", () => {
  it("normalises blank scopes and refuses bad numbers", () => {
    expect(startCountSchema.parse({ name: " Shelf A ", locationId: "", categoryId: null, blind: true })).toEqual({ name: "Shelf A", locationId: null, categoryId: null, blind: true });
    expect(startCountSchema.safeParse({ name: " ", blind: true }).success).toBe(false);
    expect(recordCountSchema.safeParse({ countId: "c", lineId: "l", counted: -1 }).success).toBe(false);
    expect(recordCountSchema.safeParse({ countId: "c", lineId: "l", counted: 1.5 }).success).toBe(false);
    expect(recordCountSchema.parse({ countId: "c", lineId: "l", counted: 4, note: "" }).note).toBeNull();
    expect(addCountLineSchema.safeParse({ countId: "c", itemId: "", locationId: "l", counted: 1 }).error?.issues[0]?.message).toBe("Choose an item.");
  });

  it("checks schedule rhythm and start date", () => {
    expect(scheduleSchema.parse({ name: "Shelves", everyDays: 7, blind: false }).firstRunDate).toBe("");
    expect(scheduleSchema.safeParse({ name: "Shelves", everyDays: 0, blind: false }).success).toBe(false);
    expect(scheduleSchema.safeParse({ name: "Shelves", everyDays: 7, blind: false, firstRunDate: "24/10/2026" }).success).toBe(false);
  });
});
