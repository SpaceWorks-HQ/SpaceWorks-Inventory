import "server-only";

import { prisma, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { createAssets } from "@/lib/catalogue/assets";
import { createItem } from "@/lib/catalogue/items";
import { createContainers, saveKit } from "@/lib/catalogue/kits";
import { createLocation } from "@/lib/catalogue/locations";
import { saveCategory, saveUnit } from "@/lib/catalogue/taxonomy";
import { DomainError } from "@/lib/domainError";
import { currencyMinorDigits } from "@/lib/format/money";
import { receiveStock } from "@/lib/inventory/availability";
import { SAMPLE_CATEGORIES, SAMPLE_CONTAINER_COUNT, SAMPLE_ITEMS, SAMPLE_KITS, SAMPLE_LOCATIONS, SAMPLE_UNITS } from "./data";

/** Reuse a row the space already has (same code or name), else create it. */
async function locationIds(tx: Tx, spaceId: string, actor: { userId: string | null }) {
  const existing = await tx.location.findMany({ where: { spaceId, code: { in: SAMPLE_LOCATIONS.map((l) => l.code) } }, select: { id: true, code: true, archivedAt: true } });
  const ids = new Map(existing.filter((l) => !l.archivedAt).map((l) => [l.code, l.id]));
  if (existing.some((l) => l.archivedAt)) throw new DomainError("An archived location uses a sample code. Restore or rename it first.", "conflict");
  for (const location of SAMPLE_LOCATIONS) {
    if (ids.has(location.code)) continue;
    const created = await createLocation(tx, spaceId, { name: location.name, code: location.code, kind: location.kind, parentId: location.parent ? ids.get(location.parent) : undefined }, actor);
    ids.set(location.code, created.id);
  }
  return ids;
}

async function taxonomyIds(tx: Tx, spaceId: string, actor: { userId: string | null }) {
  const [categories, units] = await Promise.all([
    tx.category.findMany({ where: { spaceId }, select: { id: true, name: true } }),
    tx.unit.findMany({ where: { spaceId }, select: { id: true, name: true, symbol: true } }),
  ]);
  const categoryIds = new Map(categories.map((c) => [c.name, c.id]));
  const unitIds = new Map(units.map((u) => [u.symbol, u.id]));
  for (const name of SAMPLE_CATEGORIES) {
    if (!categoryIds.has(name)) categoryIds.set(name, (await saveCategory(tx, spaceId, null, { name }, actor)).id);
  }
  for (const unit of SAMPLE_UNITS) {
    if (unitIds.has(unit.symbol)) continue;
    const byName = units.find((u) => u.name === unit.name);
    unitIds.set(unit.symbol, byName ? byName.id : (await saveUnit(tx, spaceId, null, unit, actor)).id);
  }
  return { categoryIds, unitIds };
}

/**
 * Fill an empty space with a small, realistic makerspace inventory: a
 * building with an electronics lab and a workshop, eight categories, about
 * 25 items with stock received through the availability module, serialized
 * assets, two kits and four containers. Refuses when the space has items.
 */
export async function loadSampleData(tx: Tx, spaceId: string, actorId: string | null) {
  const actor = { userId: actorId };
  // Serialize concurrent loads for the same space on the space row.
  await tx.$queryRaw`SELECT "id" FROM "Space" WHERE "id" = ${spaceId} FOR UPDATE`;
  if ((await tx.item.count({ where: { spaceId } })) > 0) {
    throw new DomainError("Sample data only loads into a space with no items yet.", "conflict");
  }
  const space = await tx.space.findUniqueOrThrow({ where: { id: spaceId }, select: { currency: true } });
  const scale = 10 ** currencyMinorDigits(space.currency);
  const locations = await locationIds(tx, spaceId, actor);
  const { categoryIds, unitIds } = await taxonomyIds(tx, spaceId, actor);
  const ref = { refType: "SampleData", refId: spaceId };
  const itemIds = new Map<string, string>();
  let assets = 0;

  for (const sample of SAMPLE_ITEMS) {
    const item = await createItem(tx, spaceId, {
      sku: sample.sku,
      name: sample.name,
      categoryId: categoryIds.get(sample.category),
      unitId: unitIds.get(sample.unit),
      tracking: sample.assets ? "SERIALIZED" : "QUANTITY",
      brand: sample.brand,
      tags: sample.tags ?? [],
      unitCostMinor: Math.round(sample.cost * scale),
      reorderPoint: sample.reorderPoint ?? null,
      lendable: sample.lendable ?? false,
      consumable: sample.consumable ?? false,
      selfCheckout: sample.selfCheckout ?? false,
      requiresApproval: !sample.selfCheckout,
      loanDays: sample.loanDays ?? null,
    }, actor);
    itemIds.set(sample.sku, item.id);
    if (sample.stock) {
      await receiveStock(tx, { spaceId, itemId: item.id, locationId: locations.get(sample.stock.location)!, quantity: sample.stock.quantity, unitCostMinor: item.unitCostMinor, reason: "RECEIVED" }, actor, ref);
    }
    if (sample.assets) {
      const created = await createAssets(tx, spaceId, { itemId: item.id, locationId: locations.get(sample.assets.location)!, serialNumbers: sample.assets.serials, purchaseCostMinor: item.unitCostMinor, condition: "GOOD" }, actor, ref);
      assets += created.length;
    }
  }

  for (const kit of SAMPLE_KITS) {
    const clash = await tx.kit.findFirst({ where: { spaceId, name: kit.name }, select: { id: true } });
    if (!clash) await saveKit(tx, spaceId, null, { name: kit.name, description: kit.description, lendable: true, lines: kit.lines.map((line) => ({ itemId: itemIds.get(line.sku)!, quantity: line.quantity })) }, actor);
  }
  await createContainers(tx, spaceId, { count: SAMPLE_CONTAINER_COUNT, name: "Loan tote" }, actor);

  const summary = { locations: locations.size, items: itemIds.size, assets, kits: SAMPLE_KITS.length, containers: SAMPLE_CONTAINER_COUNT };
  await recordAuditEvent({ client: tx, action: "space.sample_data_loaded", spaceId, actorId, targetType: "Space", targetId: spaceId, metadata: summary });
  return summary;
}

/** Sample data is offered only while the space has no items (archived ones count). */
export async function canLoadSampleData(spaceId: string) {
  return (await prisma.item.count({ where: { spaceId } })) === 0;
}
