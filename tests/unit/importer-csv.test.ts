import { describe, expect, it } from "vitest";
import { csvCell, parseCsv, toCsv } from "@/lib/importer/csv";

describe("parseCsv", () => {
  it("reads plain rows and trims unquoted cells", () => {
    expect(parseCsv("sku, name ,qty\nA1, Arduino Uno ,3\n")).toEqual([["sku", "name", "qty"], ["A1", "Arduino Uno", "3"]]);
  });

  it("keeps commas, line breaks and doubled quotes inside quoted cells", () => {
    const text = 'name,notes\n"Plywood, 3 mm","Says ""birch""\nsecond line"\n';
    expect(parseCsv(text)).toEqual([["name", "notes"], ["Plywood, 3 mm", 'Says "birch"\nsecond line']]);
  });

  it("keeps spaces inside quotes but ignores whitespace around them", () => {
    expect(parseCsv('a,b\n  " padded " , x\n')).toEqual([["a", "b"], [" padded ", "x"]]);
  });

  it("handles CRLF, lone CR and a missing final line break", () => {
    expect(parseCsv("a,b\r\n1,2\r3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("drops a UTF-8 byte order mark", () => {
    const [header] = parseCsv("﻿sku,name\nX,Y");
    expect(header).toEqual(["sku", "name"]);
  });

  it("skips empty lines and lines of empty cells", () => {
    expect(parseCsv("a,b\n\n1,2\n,\n\r\n3,4\n\n")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("keeps empty cells in the middle and at the end of a row", () => {
    expect(parseCsv("a,b,c\n1,,\n")).toEqual([["a", "b", "c"], ["1", "", ""]]);
  });

  it("reads an empty quoted cell as an empty string", () => {
    expect(parseCsv('a,b\n"",2')).toEqual([["a", "b"], ["", "2"]]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("﻿\r\n\n")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("quotes cells that need it and round-trips through the parser", () => {
    const rows = [["row", "errors"], ["2", 'Name is required. Code "X" is used, too.'], ["3", "line\nbreak"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=SUM(A1:A3)")).toBe("'=SUM(A1:A3)");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(null)).toBe("");
  });
});
