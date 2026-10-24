import { describe, expect, it } from "vitest";
import { addKitToTray, addToTray, parseTray, setTrayQuantity, TRAY_MAX_LINES, trayUnits } from "@/lib/desk/borrowTray";
import { availabilityWord, matchesSearch } from "@/lib/desk/catalogueWords";

describe("request tray", () => {
  it("merges repeat adds, clamps quantities and removes at zero", () => {
    let tray = addToTray([], "drill").tray;
    tray = addToTray(tray, "drill", 2).tray;
    expect(tray).toEqual([{ itemId: "drill", quantity: 3 }]);
    expect(setTrayQuantity(tray, "drill", 500)).toEqual([{ itemId: "drill", quantity: 99 }]);
    expect(setTrayQuantity(tray, "drill", 0)).toEqual([]);
    expect(trayUnits([{ itemId: "a", quantity: 2 }, { itemId: "b", quantity: 3 }])).toBe(5);
  });

  it("refuses more than the item limit, also for kits", () => {
    const full = Array.from({ length: TRAY_MAX_LINES }, (_, i) => ({ itemId: `item${i}`, quantity: 1 }));
    expect(addToTray(full, "extra").added).toBe(false);
    expect(addToTray(full, "item3").added).toBe(true);
    const kit = addKitToTray(full.slice(0, 19), [{ itemId: "x", quantity: 1 }, { itemId: "y", quantity: 2 }]);
    expect(kit.added).toBe(false);
    expect(kit.tray).toHaveLength(TRAY_MAX_LINES);
  });

  it("reads a stored tray defensively", () => {
    expect(parseTray("not json")).toEqual([]);
    expect(parseTray(JSON.stringify({ itemId: "a" }))).toEqual([]);
    const raw = JSON.stringify([{ itemId: "a", quantity: 2 }, { itemId: "a", quantity: 1 }, { itemId: "gone", quantity: 1 }, { itemId: "b", quantity: -1 }, { itemId: "c", quantity: 2.7 }]);
    expect(parseTray(raw, new Set(["a", "b", "c"]))).toEqual([{ itemId: "a", quantity: 2 }, { itemId: "c", quantity: 2 }]);
  });
});

describe("catalogue words", () => {
  const now = new Date("2026-10-20T06:00:00Z");
  it("says how many are free, when one comes back, or that it is out of stock", () => {
    expect(availabilityWord({ available: 3, earliestDue: null }, "Asia/Kolkata", now)).toEqual({ text: "3 available", tone: "success" });
    expect(availabilityWord({ available: 0, earliestDue: new Date("2026-10-24T12:00:00Z") }, "Asia/Kolkata", now)).toEqual({ text: "On loan until Sat 24 Oct", tone: "warning" });
    expect(availabilityWord({ available: 0, earliestDue: null }, "Asia/Kolkata", now)).toEqual({ text: "Out of stock", tone: "danger" });
  });

  it("searches name, SKU, brand, model, category and tags", () => {
    const item = { name: "Cordless drill", sku: "DRL-1", brand: "Bosch", model: "GSR 12V", category: "Power tools", tags: ["wood"] };
    for (const q of ["drill", "drl", "bosch", "12v", "power", "WOOD", ""]) expect(matchesSearch(item, q), q).toBe(true);
    expect(matchesSearch(item, "solder")).toBe(false);
  });
});
