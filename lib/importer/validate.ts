import "server-only";

import type { DbClient } from "@/lib/db";
import type { ImportKind } from "./columns";
import { parseRow, type AssetRow, type CategoryRow, type ItemRow, type LocationRow, type RowData, type StockRow } from "./rows";

export type ImportOptions = { createMissing: boolean; updateExisting: boolean };
export type SourceRow = { line: number; values: Record<string, string> };
/** A row after every check. `refs` holds database ids resolved during validation (item, location, existing item to update). */
export type CheckedRow<K extends ImportKind = ImportKind> = SourceRow & { errors: string[]; data: RowData[K] | null; refs: Record<string, string> };

type Ctx = { client: DbClient; spaceId: string; options: ImportOptions };
const lower = (value: string) => value.toLowerCase();
const uniq = (values: Array<string | null | undefined>) => [...new Set(values.filter((v): v is string => Boolean(v)))];

/** First row (by line) holding each key, so later duplicates can point back at it. */
function firstSeen() {
  const seen = new Map<string, number>();
  return (key: string, line: number) => {
    const earlier = seen.get(key);
    if (earlier === undefined) seen.set(key, line);
    return earlier;
  };
}

async function checkLocations(ctx: Ctx, rows: CheckedRow<"locations">[]) {
  const data = rows.map((row) => row.data).filter((d): d is LocationRow => d !== null);
  const existing = await ctx.client.location.findMany({ where: { spaceId: ctx.spaceId, code: { in: uniq(data.flatMap((d) => [d.code, d.parentCode])) } }, select: { code: true, archivedAt: true } });
  const inDb = new Map(existing.map((loc) => [loc.code, loc]));
  const seen = firstSeen();
  const fileRows = new Map<string, CheckedRow<"locations">>();
  for (const row of rows) if (row.data && !fileRows.has(row.data.code)) fileRows.set(row.data.code, row);
  for (const row of rows) {
    const d = row.data;
    if (!d) continue;
    const earlier = seen(d.code, row.line);
    if (earlier !== undefined) row.errors.push(`Code ${d.code} appears more than once in this file (row ${earlier}).`);
    else if (inDb.has(d.code)) row.errors.push(`Code ${d.code} is already used by another location.`);
    if (!d.parentCode) continue;
    const parentRow = fileRows.get(d.parentCode);
    const parentDb = inDb.get(d.parentCode);
    if (d.parentCode === d.code) row.errors.push("A location can't sit inside itself.");
    else if (parentDb) {
      if (parentDb.archivedAt) row.errors.push(`Parent location ${d.parentCode} is archived. Restore it or choose another.`);
    } else if (!parentRow) row.errors.push(`Parent location ${d.parentCode} wasn't found. Add it above this row or create it first.`);
    else if (parentRow.line > row.line) row.errors.push(`Parent location ${d.parentCode} must be listed above this row.`);
    else if (parentRow.errors.length > 0) row.errors.push(`Parent location ${d.parentCode} (row ${parentRow.line}) has errors.`);
  }
}

async function checkCategories(ctx: Ctx, rows: CheckedRow<"categories">[]) {
  const data = rows.map((row) => row.data).filter((d): d is CategoryRow => d !== null);
  const names = uniq(data.flatMap((d) => [d.name, d.parent]));
  const existing = await ctx.client.category.findMany({ where: { spaceId: ctx.spaceId, name: { in: names, mode: "insensitive" } }, select: { name: true } });
  const inDb = new Set(existing.map((c) => lower(c.name)));
  const seen = firstSeen();
  const fileRows = new Map<string, CheckedRow<"categories">>();
  for (const row of rows) if (row.data && !fileRows.has(lower(row.data.name))) fileRows.set(lower(row.data.name), row);
  for (const row of rows) {
    const d = row.data;
    if (!d) continue;
    const earlier = seen(lower(d.name), row.line);
    if (earlier !== undefined) row.errors.push(`Category ${d.name} appears more than once in this file (row ${earlier}).`);
    else if (inDb.has(lower(d.name))) row.errors.push(`Category ${d.name} already exists.`);
    if (!d.parent) continue;
    const parentRow = fileRows.get(lower(d.parent));
    if (lower(d.parent) === lower(d.name)) row.errors.push("A category can't sit inside itself.");
    else if (inDb.has(lower(d.parent))) continue;
    else if (!parentRow) row.errors.push(`Parent category ${d.parent} wasn't found. Add it above this row or create it first.`);
    else if (parentRow.line > row.line) row.errors.push(`Parent category ${d.parent} must be listed above this row.`);
    else if (parentRow.errors.length > 0) row.errors.push(`Parent category ${d.parent} (row ${parentRow.line}) has errors.`);
  }
}

async function checkItems(ctx: Ctx, rows: CheckedRow<"items">[]) {
  const data = rows.map((row) => row.data).filter((d): d is ItemRow => d !== null);
  const [items, categories, units] = await Promise.all([
    ctx.client.item.findMany({ where: { spaceId: ctx.spaceId, sku: { in: uniq(data.map((d) => d.sku)) } }, select: { id: true, sku: true, tracking: true, archivedAt: true } }),
    ctx.client.category.findMany({ where: { spaceId: ctx.spaceId, name: { in: uniq(data.map((d) => d.category)), mode: "insensitive" } }, select: { name: true } }),
    ctx.client.unit.findMany({ where: { spaceId: ctx.spaceId, OR: [{ name: { in: uniq(data.map((d) => d.unit)), mode: "insensitive" } }, { symbol: { in: uniq(data.map((d) => d.unit)), mode: "insensitive" } }] }, select: { name: true, symbol: true } }),
  ]);
  const bySku = new Map(items.map((item) => [item.sku, item]));
  const categoryNames = new Set(categories.map((c) => lower(c.name)));
  const unitNames = new Set(units.flatMap((u) => [lower(u.name), lower(u.symbol)]));
  const seen = firstSeen();
  const missingHint = "Create it first or turn on Create missing categories and units.";
  for (const row of rows) {
    const d = row.data;
    if (!d) continue;
    if (d.sku) {
      const earlier = seen(d.sku, row.line);
      const existing = bySku.get(d.sku);
      if (earlier !== undefined) row.errors.push(`SKU ${d.sku} appears more than once in this file (row ${earlier}).`);
      else if (existing && !ctx.options.updateExisting) row.errors.push(`SKU ${d.sku} already exists. Turn on Update existing items to change it.`);
      else if (existing?.archivedAt) row.errors.push(`SKU ${d.sku} belongs to an archived item. Restore it first.`);
      else if (existing && d.tracking && d.tracking !== existing.tracking) row.errors.push(`SKU ${d.sku} is tracked by ${existing.tracking.toLowerCase()}; tracking can't change on import.`);
      else if (existing && d.consumable && existing.tracking === "SERIALIZED") row.errors.push("Consumable can't be yes for a serialized item.");
      else if (existing) row.refs.itemId = existing.id;
    }
    if (!ctx.options.createMissing) {
      if (d.category && !categoryNames.has(lower(d.category))) row.errors.push(`Category ${d.category} wasn't found. ${missingHint}`);
      if (d.unit && !unitNames.has(lower(d.unit))) row.errors.push(`Unit ${d.unit} wasn't found. ${missingHint}`);
    }
  }
}

async function checkStockOrAssets(ctx: Ctx, rows: Array<CheckedRow<"stock"> | CheckedRow<"assets">>, kind: "stock" | "assets") {
  const data = rows.map((row) => row.data).filter((d): d is StockRow | AssetRow => d !== null);
  const [items, locations] = await Promise.all([
    ctx.client.item.findMany({ where: { spaceId: ctx.spaceId, sku: { in: uniq(data.map((d) => d.sku)) } }, select: { id: true, sku: true, tracking: true, archivedAt: true } }),
    ctx.client.location.findMany({ where: { spaceId: ctx.spaceId, code: { in: uniq(data.map((d) => d.locationCode)) } }, select: { id: true, code: true, archivedAt: true } }),
  ]);
  const bySku = new Map(items.map((item) => [item.sku, item]));
  const byCode = new Map(locations.map((loc) => [loc.code, loc]));
  const serials = kind === "assets"
    ? await ctx.client.asset.findMany({ where: { spaceId: ctx.spaceId, itemId: { in: items.map((i) => i.id) }, serialNumber: { in: uniq(data.map((d) => ("serialNumber" in d ? d.serialNumber : null))) } }, select: { itemId: true, serialNumber: true } })
    : [];
  const takenSerials = new Set(serials.map((s) => `${s.itemId}:${s.serialNumber}`));
  const seen = firstSeen();
  for (const row of rows) {
    const d = row.data;
    if (!d) continue;
    const item = bySku.get(d.sku);
    const location = byCode.get(d.locationCode);
    if (!item) row.errors.push(`SKU ${d.sku} wasn't found. Import or create the item first.`);
    else if (item.archivedAt) row.errors.push(`SKU ${d.sku} belongs to an archived item.`);
    else if (kind === "stock" && item.tracking === "SERIALIZED") row.errors.push(`SKU ${d.sku} is a serialized item. Import its assets instead.`);
    else if (kind === "assets" && item.tracking === "QUANTITY") row.errors.push(`SKU ${d.sku} is a quantity item. Import its stock instead.`);
    else row.refs.itemId = item.id;
    if (!location) row.errors.push(`Location ${d.locationCode} wasn't found.`);
    else if (location.archivedAt) row.errors.push(`Location ${d.locationCode} is archived.`);
    else row.refs.locationId = location.id;
    if ("serialNumber" in d && d.serialNumber) {
      const earlier = seen(`${d.sku}:${d.serialNumber}`, row.line);
      if (earlier !== undefined) row.errors.push(`Serial ${d.serialNumber} appears more than once for SKU ${d.sku} (row ${earlier}).`);
      else if (item && takenSerials.has(`${item.id}:${d.serialNumber}`)) row.errors.push(`Serial ${d.serialNumber} is already registered for SKU ${d.sku}.`);
    }
  }
}

/**
 * Check every row: fields first, then duplicates within the file and
 * against the database, then references (which may point at rows above in
 * the same file). Runs at preview and again inside the apply transaction.
 */
export async function validateRows<K extends ImportKind>(client: DbClient, space: { id: string; currency: string }, kind: K, source: SourceRow[], options: ImportOptions): Promise<CheckedRow<K>[]> {
  const rows = source.map((row) => {
    const parsed = parseRow(kind, row.values, space.currency);
    return { ...row, errors: [...parsed.errors], data: parsed.data, refs: {} } as CheckedRow<K>;
  });
  const ctx: Ctx = { client, spaceId: space.id, options };
  if (kind === "locations") await checkLocations(ctx, rows as CheckedRow<"locations">[]);
  else if (kind === "categories") await checkCategories(ctx, rows as CheckedRow<"categories">[]);
  else if (kind === "items") await checkItems(ctx, rows as CheckedRow<"items">[]);
  else await checkStockOrAssets(ctx, rows as Array<CheckedRow<"stock"> | CheckedRow<"assets">>, kind as "stock" | "assets");
  return rows;
}
