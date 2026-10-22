/**
 * What each import kind reads (pure, client-safe). Header names are matched
 * case- and space-insensitively ("Parent code", "parent_code" and
 * "PARENT-CODE" are the same) and through a few common aliases.
 */
export const IMPORT_KINDS = ["locations", "categories", "items", "stock", "assets"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === "string" && (IMPORT_KINDS as readonly string[]).includes(value);
}

type Column = { key: string; required?: boolean; aliases?: string[] };

export const IMPORT_COLUMNS: Record<ImportKind, Column[]> = {
  locations: [
    { key: "name", required: true, aliases: ["location", "location name"] },
    { key: "code", required: true, aliases: ["location code", "loc code"] },
    { key: "kind", aliases: ["type", "location type"] },
    { key: "parent_code", aliases: ["parent", "parent location", "parent location code", "inside"] },
    { key: "description", aliases: ["notes"] },
  ],
  categories: [
    { key: "name", required: true, aliases: ["category", "category name"] },
    { key: "parent", aliases: ["parent category", "parent name"] },
    { key: "description", aliases: ["notes"] },
  ],
  items: [
    { key: "sku", aliases: ["item code", "code", "part number", "part no"] },
    { key: "name", required: true, aliases: ["item", "item name", "title"] },
    { key: "category", aliases: ["category name"] },
    { key: "unit", aliases: ["uom", "unit of measure"] },
    { key: "tracking", aliases: ["tracking mode", "tracked by"] },
    { key: "description" },
    { key: "brand", aliases: ["make", "manufacturer"] },
    { key: "model", aliases: ["model number"] },
    { key: "unit_cost", aliases: ["cost", "price", "unit price"] },
    { key: "reorder_point", aliases: ["reorder level", "min stock", "minimum stock", "min"] },
    { key: "reorder_quantity", aliases: ["reorder qty", "order quantity"] },
    { key: "lendable", aliases: ["loanable", "can borrow"] },
    { key: "consumable" },
    { key: "self_checkout", aliases: ["self check out", "self checkout allowed"] },
    { key: "loan_days", aliases: ["loan period", "loan period days"] },
    { key: "deposit", aliases: ["deposit amount"] },
    { key: "tags", aliases: ["tag", "labels"] },
  ],
  stock: [
    { key: "sku", required: true, aliases: ["item code", "code"] },
    { key: "location_code", required: true, aliases: ["location", "location code", "loc code"] },
    { key: "quantity", required: true, aliases: ["qty", "count", "on hand"] },
    { key: "unit_cost", aliases: ["cost", "price", "unit price"] },
  ],
  assets: [
    { key: "sku", required: true, aliases: ["item code", "code"] },
    { key: "location_code", required: true, aliases: ["location", "location code", "loc code"] },
    { key: "serial_number", aliases: ["serial", "serial no", "sn"] },
    { key: "purchase_cost", aliases: ["cost", "price", "purchase price"] },
    { key: "purchased_at", aliases: ["purchase date", "purchased on", "bought on"] },
  ],
};

export const IMPORT_KIND_LABELS: Record<ImportKind, string> = {
  locations: "Locations",
  categories: "Categories",
  items: "Items",
  stock: "Stock (quantity items)",
  assets: "Assets (serialized items)",
};

/** "Parent Code", " parent_code ", "PARENT-CODE" → "parent code". */
export function normalizeHeader(header: string): string {
  return header.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_\-.]+/g, " ").replace(/[^a-z0-9 ]/g, "").trim();
}

export type HeaderMap = {
  /** Canonical key → column index in the file. */
  indexes: Record<string, number>;
  /** Headers in the file that match nothing (ignored). */
  ignored: string[];
  /** Required columns the file lacks. */
  missing: string[];
};

export function mapHeaders(kind: ImportKind, headers: string[]): HeaderMap {
  const lookup = new Map<string, string>();
  for (const column of IMPORT_COLUMNS[kind]) {
    for (const name of [column.key, ...(column.aliases ?? [])]) lookup.set(normalizeHeader(name), column.key);
  }
  const indexes: Record<string, number> = {};
  const ignored: string[] = [];
  headers.forEach((header, index) => {
    const key = lookup.get(normalizeHeader(header));
    if (key && indexes[key] === undefined) indexes[key] = index;
    else if (header.trim()) ignored.push(header.trim());
  });
  const missing = IMPORT_COLUMNS[kind].filter((column) => column.required && indexes[column.key] === undefined).map((column) => column.key);
  return { indexes, ignored, missing };
}

/** Turn the data rows into records keyed by canonical column (cells trimmed, absent columns left out). */
export function toRecords(map: HeaderMap, rows: string[][]): Array<Record<string, string>> {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (const [key, index] of Object.entries(map.indexes)) record[key] = (row[index] ?? "").trim();
    return record;
  });
}
