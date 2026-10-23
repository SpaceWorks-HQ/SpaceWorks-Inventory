import { describe, expect, it } from "vitest";
import { extractQrCode } from "@/lib/catalogue/qr";
import { dateInputToDate, dateInputValue } from "@/lib/desk/dates";
import { addScan, normalizeScan, scanKindOf, scanProgress } from "@/lib/desk/scanCodes";
import { allowedTransferActions, directionWhere, sideOf, transferEventTitle } from "@/lib/desk/transferLogic";
import { dispatchSchema, requestTransferSchema } from "@/lib/desk/transferSchemas";

describe("desk scan codes", () => {
  const samples = ["A7K2M9Q4R8T3W5Y6", " a7k2m9q4r8t3w5y6 ", "https://inv.example.org/q/I7K2M9Q4R8T3W5Y6", "/q/L7K2M9Q4R8T3W5Y6/?x=1", "B7K2M9Q4R8T3W5Y6", "A7K2M9Q4R8T3W5Y", "A0K2M9Q4R8T3W5Y6", "", "hello"];
  it.each(samples)("agrees with the server's extractQrCode for %j", (value) => {
    expect(normalizeScan(value)).toBe(extractQrCode(value));
  });
  it("knows the kind and adds each code once", () => {
    expect(scanKindOf("C7K2M9Q4R8T3W5Y6")).toBe("container");
    expect(addScan(["A"], "A")).toEqual({ list: ["A"], added: false });
    expect(addScan(["A"], "B")).toEqual({ list: ["A", "B"], added: true });
  });
  it("counts what is still to scan", () => {
    expect(scanProgress([{ need: 2, have: 3 }, { need: 1, have: 0 }])).toEqual({ need: 3, have: 2, remaining: 1, done: false });
  });
});

describe("desk dates", () => {
  it("reads a date input in the space time zone", () => {
    expect(dateInputToDate("2026-10-24", "Asia/Kolkata", "09:00")?.toISOString()).toBe("2026-10-24T03:30:00.000Z");
    expect(dateInputToDate("", "Asia/Kolkata")).toBeNull();
    expect(Number.isNaN(dateInputToDate("24/10/2026", "Asia/Kolkata")!.getTime())).toBe(true);
    expect(dateInputValue(new Date("2026-10-23T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-24");
  });
});

describe("transfer desk rules", () => {
  const between = { sourceSpaceId: "a", destSpaceId: "b" };
  it("finds the viewer's side", () => {
    expect(sideOf(between, "a")).toBe("source");
    expect(sideOf(between, "b")).toBe("destination");
    expect(sideOf(between, "c")).toBeNull();
    expect(sideOf({ sourceSpaceId: "a", destSpaceId: "a" }, "a")).toBe("both");
  });
  it("offers each side only its own steps, by role", () => {
    expect(allowedTransferActions("REQUESTED", "source", "MANAGER")).toEqual(["approve", "reject", "cancel"]);
    expect(allowedTransferActions("REQUESTED", "source", "STAFF")).toEqual(["cancel"]);
    expect(allowedTransferActions("REQUESTED", "destination", "OWNER")).toEqual(["cancel"]);
    expect(allowedTransferActions("APPROVED", "destination", "STAFF")).toEqual(["cancel"]);
    expect(allowedTransferActions("APPROVED", "source", "STAFF")).toEqual(["cancel", "dispatch"]);
    expect(allowedTransferActions("DISPATCHED", "destination", "STAFF")).toEqual(["receive", "missing", "sendBack"]);
    expect(allowedTransferActions("DISPATCHED", "source", "STAFF")).toEqual(["missing"]);
    expect(allowedTransferActions("RETURNING", "source", "STAFF")).toEqual(["missing", "receiveReturn"]);
    expect(allowedTransferActions("DISPATCHED", "both", "STAFF")).toEqual(["receive", "missing", "sendBack"]);
    expect(allowedTransferActions("RECEIVED", "both", "OWNER")).toEqual([]);
    expect(allowedTransferActions("REQUESTED", "source", "MEMBER")).toEqual([]);
  });
  it("filters by direction and words the timeline", () => {
    expect(directionWhere("a", "in")).toEqual({ destSpaceId: "a" });
    expect(directionWhere("a", "all")).toEqual({ OR: [{ sourceSpaceId: "a" }, { destSpaceId: "a" }] });
    expect(transferEventTitle("received", { received: 3, damaged: 1 })).toBe("Received 3, 1 damaged");
    expect(transferEventTitle("approved", { automatic: true })).toBe("Approved automatically");
    expect(transferEventTitle("dispatched", { units: 1 })).toBe("Dispatched (1 unit)");
    expect(transferEventTitle("mystery", null)).toBe("Updated");
  });
});

describe("transfer desk schemas", () => {
  it("accepts each kind of request and refuses bad lines", () => {
    expect(requestTransferSchema.safeParse({ mode: "internal", sourceLocationId: "l1", destLocationId: "l2", lines: [{ itemId: "i", quantity: 2 }], reason: "", neededBy: "" }).success).toBe(true);
    expect(requestTransferSchema.safeParse({ mode: "pull", sourceSpaceSlug: "other", destLocationId: null, lines: [{ itemId: "i", quantity: 1 }] }).success).toBe(true);
    expect(requestTransferSchema.safeParse({ mode: "push", destSpaceSlug: "other", sourceLocationId: "l1", lines: [] }).success).toBe(false);
    expect(requestTransferSchema.safeParse({ mode: "internal", sourceLocationId: "l1", destLocationId: "l2", lines: [{ itemId: "i", quantity: 0 }] }).success).toBe(false);
    expect(requestTransferSchema.safeParse({ mode: "teleport", lines: [{ itemId: "i", quantity: 1 }] }).success).toBe(false);
  });
  it("normalises optional dispatch details", () => {
    const parsed = dispatchSchema.parse({ transferId: "t", quantities: { l: 2 }, scannedCodes: [], carrier: "  ", trackingRef: undefined, expectedAt: undefined });
    expect(parsed).toMatchObject({ carrier: null, trackingRef: null, expectedAt: "", remarks: "" });
  });
});
