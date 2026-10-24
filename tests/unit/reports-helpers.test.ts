import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { compactNumber, linePoints, niceMax, scale, ticks } from "@/lib/reports/chart";
import { isReportKey, REPORTS } from "@/lib/reports/keys";
import { dayInZone, eachDay, parseRange, startOfDay } from "@/lib/reports/range";
import { isExportFormat, tablesToCsv, tablesToXlsx, tableToCsv, type ReportTable } from "@/lib/reports/table";

const NOW = new Date("2026-10-23T08:00:00Z");

describe("report date ranges", () => {
  it("defaults to the last 30 days ending today in the space time zone", () => {
    const range = parseRange({}, "Asia/Kolkata", NOW);
    expect(range.toDay).toBe("2026-10-23");
    expect(range.fromDay).toBe("2026-09-24");
    expect(range.from.toISOString()).toBe("2026-09-23T18:30:00.000Z");
    expect(range.to.toISOString()).toBe("2026-10-23T18:30:00.000Z");
  });

  it("uses the zone's calendar day, not UTC", () => {
    expect(dayInZone(new Date("2026-10-23T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-24");
    expect(dayInZone(new Date("2026-10-23T20:00:00Z"), "UTC")).toBe("2026-10-23");
  });

  it("orders swapped days, ignores invalid ones and caps the span at a year", () => {
    expect(parseRange({ from: "2026-10-20", to: "2026-10-01" }, "UTC", NOW)).toMatchObject({ fromDay: "2026-10-01", toDay: "2026-10-20" });
    expect(parseRange({ from: "2026-02-30", to: "nope" }, "UTC", NOW)).toMatchObject({ fromDay: "2026-09-24", toDay: "2026-10-23" });
    expect(parseRange({ from: "2020-01-01", to: "2026-10-23" }, "UTC", NOW).fromDay).toBe("2025-10-23");
    expect(parseRange({ from: ["2026-10-01"], to: 5 }, "UTC", NOW).toDay).toBe("2026-10-23");
  });

  it("lists every day of a range inclusively", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(startOfDay("2026-10-23", "Europe/London").toISOString()).toBe("2026-10-22T23:00:00.000Z");
  });
});

describe("chart scales", () => {
  it("rounds the axis up to a nice number", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(230)).toBe(250);
    expect(niceMax(4200)).toBe(5000);
  });

  it("scales, ticks and plots inside the box", () => {
    expect(scale(50, 100, 200)).toBe(100);
    expect(scale(500, 100, 200)).toBe(200);
    expect(scale(5, 0, 200)).toBe(0);
    expect(ticks(100, 4)).toEqual([0, 25, 50, 75, 100]);
    expect(linePoints([0, 10, 5], 10, 100, 50)).toEqual([[0, 50], [50, 0], [100, 25]]);
    expect(linePoints([], 10, 100, 50)).toEqual([]);
    expect(compactNumber(1200)).toBe("1.2k");
  });
});

describe("report keys", () => {
  it("recognises every report and nothing else", () => {
    for (const report of REPORTS) expect(isReportKey(report.key)).toBe(true);
    expect(isReportKey("secrets")).toBe(false);
    expect(isExportFormat("csv")).toBe(true);
    expect(isExportFormat("pdf")).toBe(false);
  });
});

const table: ReportTable = {
  title: "Valuation by item",
  columns: [{ key: "name", label: "Item" }, { key: "qty", label: "On hand", kind: "number" }, { key: "value", label: "Value", kind: "money" }],
  rows: [
    { name: "=HYPERLINK(\"x\")", qty: -3, value: 125050 },
    { name: "Drill, cordless", qty: 2, value: null },
  ],
};

describe("report exports", () => {
  it("writes money in major units, keeps negative numbers and neutralises formulas", () => {
    const csv = tableToCsv(table, "INR");
    expect(csv.split("\r\n")).toEqual(["Item,On hand,Value (INR)", "\"'=HYPERLINK(\"\"x\"\")\",-3,1250.5", "\"Drill, cordless\",2,", ""]);
  });

  it("respects currencies without minor units and labels sections", () => {
    expect(tableToCsv({ ...table, rows: [{ name: "Saw", qty: 1, value: 500 }] }, "JPY")).toContain("Saw,1,500");
    const both = tablesToCsv([table, { ...table, title: "Second" }], "INR");
    expect(both.startsWith("Valuation by item\r\n")).toBe(true);
    expect(both).toContain("\r\nSecond\r\n");
  });

  it("builds one worksheet per table with text kept as text", async () => {
    const buffer = await tablesToXlsx([table, { ...table, title: "Valuation by item" }], "INR");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Valuation by item", "Valuation by item 2"]);
    const row = workbook.worksheets[0]!.getRow(2);
    expect(row.getCell(1).value).toBe("=HYPERLINK(\"x\")");
    expect(row.getCell(3).value).toBe(1250.5);
    expect(workbook.worksheets[0]!.getRow(1).getCell(3).value).toBe("Value (INR)");
  });
});
