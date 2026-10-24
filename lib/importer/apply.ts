import "server-only";

import type { Item } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { createAssets } from "@/lib/catalogue/assets";
import { createItem, updateItem } from "@/lib/catalogue/items";
import { createLocation } from "@/lib/catalogue/locations";
import type { ItemInput } from "@/lib/catalogue/schemas";
import { saveCategory, saveUnit } from "@/lib/catalogue/taxonomy";
import { receiveStock } from "@/lib/inventory/availability";
import type { ImportKind } from "./columns";
import type { AssetRow, CategoryRow, ItemRow, LocationRow, StockRow } from "./rows";
import type { CheckedRow, ImportOptions } from "./validate";

type Actor = { userId: string | null };
type Env = { tx: Tx; spaceId: string; actor: Actor; jobId: string; options: ImportOptions };
export type ApplyOutcome = { created: number; updated: number; failed: Array<{ line: number; error: string }> };

const lower = (value: string) => value.toLowerCase();
const orUndefined = <T>(value: T | null) => (value === null ? undefined : value);

/** A business refusal (DomainError, StockError, zod) that should skip the row, not abort the import. */
function isRowRefusal(error: unknown): error is Error {
  return error instanceof Error && (("code" in error && typeof (error as { code: unknown }).code === "string") || error.name === "ZodError");
}

async function lookupMaps(env: Env, kind: ImportKind) {
  const [locations, categories, units] = await Promise.all([
    kind === "locations" ? env.tx.location.findMany({ where: { spaceId: env.spaceId }, select: { id: true, code: true } }) : [],
    kind === "categories" || kind === "items" ? env.tx.category.findMany({ where: { spaceId: env.spaceId }, select: { id: true, name: true } }) : [],
    kind === "items" ? env.tx.unit.findMany({ where: { spaceId: env.spaceId }, select: { id: true, name: true, symbol: true } }) : [],
  ]);
  return {
    locations: new Map(locations.map((l) => [l.code, l.id])),
    categories: new Map(categories.map((c) => [lower(c.name), c.id])),
    units: new Map(units.flatMap((u) => [[lower(u.symbol), u.id], [lower(u.name), u.id]] as const)),
  };
}
type Maps = Awaited<ReturnType<typeof lookupMaps>>;

async function categoryId(env: Env, maps: Maps, name: string | null) {
  if (!name) return null;
  const known = maps.categories.get(lower(name));
  if (known) return known;
  const created = await saveCategory(env.tx, env.spaceId, null, { name }, env.actor);
  maps.categories.set(lower(name), created.id);
  return created.id;
}

async function unitId(env: Env, maps: Maps, name: string | null) {
  if (!name) return null;
  const known = maps.units.get(lower(name));
  if (known) return known;
  const created = await saveUnit(env.tx, env.spaceId, null, { name, symbol: name.slice(0, 10) }, env.actor);
  maps.units.set(lower(name), created.id);
  return created.id;
}

/** The full input for `updateItem`: the item as it is, with the file's non-empty cells on top. */
function mergedItemInput(existing: Item, row: ItemRow, refs: { categoryId: string | null; unitId: string | null }): ItemInput {
  return {
    name: row.name,
    sku: existing.sku,
    description: orUndefined(row.description ?? existing.description),
    categoryId: orUndefined(row.category ? refs.categoryId : existing.categoryId),
    unitId: orUndefined(row.unit ? refs.unitId : existing.unitId),
    supplierId: orUndefined(existing.supplierId),
    tracking: existing.tracking,
    barcode: orUndefined(existing.barcode),
    brand: orUndefined(row.brand ?? existing.brand),
    model: orUndefined(row.model ?? existing.model),
    tags: row.tags ?? existing.tags,
    unitCostMinor: row.unitCostMinor ?? existing.unitCostMinor,
    reorderPoint: row.reorderPoint ?? existing.reorderPoint,
    reorderQuantity: row.reorderQuantity ?? existing.reorderQuantity,
    lendable: row.lendable ?? existing.lendable,
    consumable: row.consumable ?? existing.consumable,
    selfCheckout: row.selfCheckout ?? existing.selfCheckout,
    requiresApproval: existing.requiresApproval,
    loanDays: row.loanDays ?? existing.loanDays,
    replacementMinor: existing.replacementMinor,
    depositMinor: row.depositMinor ?? existing.depositMinor,
    rentalMode: existing.rentalMode,
    rentalMinor: existing.rentalMinor,
    lateFeePerDayMinor: existing.lateFeePerDayMinor,
    notes: orUndefined(existing.notes),
  };
}

async function applyItem(env: Env, maps: Maps, row: CheckedRow<"items">): Promise<"created" | "updated"> {
  const d = row.data!;
  const refs = { categoryId: await categoryId(env, maps, d.category), unitId: await unitId(env, maps, d.unit) };
  if (row.refs.itemId && env.options.updateExisting) {
    const existing = await env.tx.item.findFirstOrThrow({ where: { id: row.refs.itemId, spaceId: env.spaceId } });
    await updateItem(env.tx, env.spaceId, existing.id, mergedItemInput(existing, d, refs), env.actor);
    return "updated";
  }
  await createItem(env.tx, env.spaceId, {
    name: d.name, sku: orUndefined(d.sku), description: orUndefined(d.description), categoryId: orUndefined(refs.categoryId), unitId: orUndefined(refs.unitId),
    tracking: d.tracking ?? "QUANTITY", brand: orUndefined(d.brand), model: orUndefined(d.model), tags: d.tags ?? [], unitCostMinor: d.unitCostMinor ?? 0,
    reorderPoint: d.reorderPoint, reorderQuantity: d.reorderQuantity, lendable: d.lendable ?? false, consumable: d.consumable ?? false,
    selfCheckout: d.selfCheckout ?? false, loanDays: d.loanDays, depositMinor: d.depositMinor,
  }, env.actor);
  return "created";
}

async function applyRow(env: Env, maps: Maps, kind: ImportKind, row: CheckedRow): Promise<"created" | "updated"> {
  const ref = { refType: "Import", refId: env.jobId };
  if (kind === "locations") {
    const d = row.data as LocationRow;
    const parentId = d.parentCode ? (maps.locations.get(d.parentCode) ?? null) : null;
    const location = await createLocation(env.tx, env.spaceId, { name: d.name, code: d.code, kind: d.kind, parentId: orUndefined(parentId), description: orUndefined(d.description) }, env.actor);
    maps.locations.set(location.code, location.id);
  } else if (kind === "categories") {
    const d = row.data as CategoryRow;
    const parentId = d.parent ? (maps.categories.get(lower(d.parent)) ?? null) : null;
    const category = await saveCategory(env.tx, env.spaceId, null, { name: d.name, parentId: orUndefined(parentId), description: orUndefined(d.description) }, env.actor);
    maps.categories.set(lower(category.name), category.id);
  } else if (kind === "items") {
    return applyItem(env, maps, row as CheckedRow<"items">);
  } else if (kind === "stock") {
    const d = row.data as StockRow;
    await receiveStock(env.tx, { spaceId: env.spaceId, itemId: row.refs.itemId!, locationId: row.refs.locationId!, quantity: d.quantity, unitCostMinor: d.unitCostMinor, reason: "RECEIVED" }, env.actor, ref);
  } else {
    const d = row.data as AssetRow;
    await createAssets(env.tx, env.spaceId, {
      itemId: row.refs.itemId!, locationId: row.refs.locationId!, serialNumbers: d.serialNumber ? [d.serialNumber] : [], count: 1,
      purchaseCostMinor: d.purchaseCostMinor, purchasedAt: d.purchasedAt ? new Date(`${d.purchasedAt}T00:00:00Z`) : null,
    }, env.actor, ref);
  }
  return "created";
}

/**
 * Apply the valid rows in file order through the catalogue services and the
 * availability module. Each row runs inside a savepoint: a row the services
 * refuse is rolled back on its own and reported, so no row is ever half
 * applied. Unexpected failures abort the whole transaction.
 */
export async function applyRows(env: Env, kind: ImportKind, rows: CheckedRow[]): Promise<ApplyOutcome> {
  let maps = await lookupMaps(env, kind);
  const outcome: ApplyOutcome = { created: 0, updated: 0, failed: [] };
  for (const row of rows) {
    if (row.errors.length > 0 || !row.data) continue;
    await env.tx.$executeRawUnsafe("SAVEPOINT import_row");
    try {
      const result = await applyRow(env, maps, kind, row);
      await env.tx.$executeRawUnsafe("RELEASE SAVEPOINT import_row");
      outcome[result] += 1;
    } catch (error) {
      if (!isRowRefusal(error)) throw error;
      await env.tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT import_row");
      // Names or codes created for the rolled-back row are gone again.
      maps = await lookupMaps(env, kind);
      outcome.failed.push({ line: row.line, error: error.name === "ZodError" ? "A value in this row isn't valid." : error.message });
    }
  }
  return outcome;
}
