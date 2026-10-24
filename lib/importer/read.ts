import "server-only";

import ExcelJS from "exceljs";
import { DomainError } from "@/lib/domainError";
import { parseCsv } from "./csv";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

export type Sheet = { headers: string[]; rows: string[][] };

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellText((value.result ?? null) as ExcelJS.CellValue);
    if ("text" in value) return typeof value.text === "string" ? value.text : "";
    if ("error" in value) return "";
    return "";
  }
  return String(value);
}

async function readXlsx(bytes: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch {
    throw new DomainError("That spreadsheet couldn't be read. Save it as .xlsx or .csv and try again.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  if (sheet.actualRowCount > MAX_IMPORT_ROWS + 1) throw tooManyRows();
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) values.push(cellText(row.getCell(column).value).trim());
    if (values.some(Boolean)) rows.push(values);
  });
  return rows;
}

function tooManyRows() {
  return new DomainError(`A file can hold at most ${MAX_IMPORT_ROWS.toLocaleString("en")} rows. Split it and import each part.`);
}

/**
 * Read an uploaded CSV or XLSX file into a header row and data rows. Only
 * the first worksheet of a workbook is read; empty rows are skipped.
 */
export async function readUpload(file: { name: string; bytes: Buffer }): Promise<Sheet> {
  if (file.bytes.length === 0) throw new DomainError("That file is empty. Choose a CSV or XLSX file with a header row.");
  if (file.bytes.length > MAX_IMPORT_BYTES) throw new DomainError("Files can be at most 5 MB. Split it and import each part.");
  const name = file.name.toLowerCase();
  const isZip = file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
  let rows: string[][];
  if (name.endsWith(".xlsx")) {
    if (!isZip) throw new DomainError("That file isn't a valid .xlsx workbook. Save it again as .xlsx or .csv.");
    rows = await readXlsx(file.bytes);
  } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
    if (isZip || file.bytes.includes(0)) throw new DomainError("That file isn't plain-text CSV. Save it as .csv and try again.");
    rows = parseCsv(new TextDecoder("utf-8").decode(file.bytes));
  } else {
    throw new DomainError("Choose a .csv or .xlsx file.");
  }
  const [headers, ...data] = rows;
  if (!headers || data.length === 0) throw new DomainError("The file needs a header row and at least one data row.");
  if (data.length > MAX_IMPORT_ROWS) throw tooManyRows();
  return { headers, rows: data };
}
