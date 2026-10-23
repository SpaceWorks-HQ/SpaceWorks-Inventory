import ExcelJS from "exceljs";
import { currencyMinorDigits } from "@/lib/format/money";

/**
 * A plain report table shared by every export (reports, audit log). Money
 * cells hold integer minor units and are written in major units; text cells
 * that look like formulas are neutralised in CSV and stored as text in XLSX.
 */
export type Cell = string | number | null;
export type ColumnKind = "text" | "number" | "money";
export type Column = { key: string; label: string; kind?: ColumnKind };
export type ReportTable = { title: string; columns: Column[]; rows: Record<string, Cell>[] };
export type ExportFormat = "csv" | "xlsx";

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === "csv" || value === "xlsx";
}

function major(minor: number, currency: string) {
  const digits = currencyMinorDigits(currency);
  return Number((minor / 10 ** digits).toFixed(digits));
}

function cellValue(column: Column, value: Cell, currency: string): string | number | null {
  if (value === null || value === undefined) return null;
  if (column.kind === "money" && typeof value === "number") return major(value, currency);
  return value;
}

function csvText(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One table as CSV (a BOM is added by the response helper). Money columns are labelled with the currency. */
export function tableToCsv(table: ReportTable, currency: string): string {
  const header = table.columns.map((column) => csvText(column.kind === "money" ? `${column.label} (${currency})` : column.label));
  const lines = table.rows.map((row) => table.columns.map((column) => csvText(cellValue(column, row[column.key] ?? null, currency))).join(","));
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

/** Several tables as CSV sections separated by a blank line and the table title. */
export function tablesToCsv(tables: ReportTable[], currency: string): string {
  if (tables.length === 1) return tableToCsv(tables[0]!, currency);
  return tables.map((table) => `${csvText(table.title)}\r\n${tableToCsv(table, currency)}`).join("\r\n");
}

function sheetName(title: string, used: Set<string>) {
  const base = title.replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet";
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 25)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}

/** One worksheet per table. Text is always stored as text, so nothing is evaluated as a formula. */
export async function tablesToXlsx(tables: ReportTable[], currency: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Space Works Inventory";
  const used = new Set<string>();
  for (const table of tables) {
    const sheet = workbook.addWorksheet(sheetName(table.title, used));
    sheet.columns = table.columns.map((column) => ({
      header: column.kind === "money" ? `${column.label} (${currency})` : column.label,
      key: column.key,
      width: Math.min(48, Math.max(12, column.label.length + 4)),
      style: column.kind === "money" ? { numFmt: currencyMinorDigits(currency) > 0 ? "#,##0.00" : "#,##0" } : {},
    }));
    sheet.getRow(1).font = { bold: true };
    for (const row of table.rows) {
      const values: Record<string, string | number | null> = {};
      for (const column of table.columns) values[column.key] = cellValue(column, row[column.key] ?? null, currency);
      sheet.addRow(values);
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Attachment response for an export, never cached. */
export function exportResponse(body: string | Buffer, fileBase: string, format: ExportFormat) {
  const safe = fileBase.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "export";
  const headers = {
    "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename="${safe}.${format}"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const payload = typeof body === "string" ? `﻿${body}` : new Uint8Array(body);
  return new Response(payload, { headers });
}
