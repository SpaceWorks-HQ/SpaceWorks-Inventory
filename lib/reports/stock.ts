import "server-only";

import { prisma } from "@/lib/db";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { reorderSuggestions } from "@/lib/purchases";
import type { ReportTable } from "./table";

/**
 * Stock valuation and low stock. StockLevel.onHand is the single truth for
 * both quantity and serialized items (each asset on the shelf is one unit
 * on hand), so value = on hand × average cost. Items received without a cost
 * fall back to their last unit cost.
 */

export type ValuationReport = {
  currency: string;
  totalMinor: number;
  inTransitMinor: number;
  byCategory: { categoryId: string | null; name: string; onHand: number; valueMinor: number }[];
  byLocation: { locationId: string; code: string; name: string; onHand: number; valueMinor: number }[];
  items: { itemId: string; sku: string; name: string; onHand: number; avgCostMinor: number; valueMinor: number; inTransit: number; inTransitMinor: number }[];
};

function costOf(item: { avgCostMinor: number; unitCostMinor: number }) {
  return item.avgCostMinor > 0 ? item.avgCostMinor : item.unitCostMinor;
}

export async function valuationReport(spaceId: string): Promise<ValuationReport> {
  const space = await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { currency: true } });
  const [items, levels, totals] = await Promise.all([
    prisma.item.findMany({
      where: { spaceId },
      select: { id: true, sku: true, name: true, avgCostMinor: true, unitCostMinor: true, categoryId: true, category: { select: { name: true } } },
    }),
    prisma.stockLevel.findMany({
      where: { spaceId, onHand: { gt: 0 } },
      select: { itemId: true, onHand: true, locationId: true, location: { select: { code: true, name: true } } },
    }),
    availabilityFor(spaceId),
  ]);
  const byId = new Map(items.map((item) => [item.id, item]));
  const categories = new Map<string, ValuationReport["byCategory"][number]>();
  const locations = new Map<string, ValuationReport["byLocation"][number]>();
  for (const level of levels) {
    const item = byId.get(level.itemId);
    if (!item) continue;
    const value = level.onHand * costOf(item);
    const categoryKey = item.categoryId ?? "";
    const category = categories.get(categoryKey) ?? { categoryId: item.categoryId, name: item.category?.name ?? "No category", onHand: 0, valueMinor: 0 };
    category.onHand += level.onHand;
    category.valueMinor += value;
    categories.set(categoryKey, category);
    const location = locations.get(level.locationId) ?? { locationId: level.locationId, code: level.location.code, name: level.location.name, onHand: 0, valueMinor: 0 };
    location.onHand += level.onHand;
    location.valueMinor += value;
    locations.set(level.locationId, location);
  }
  const rows = items
    .map((item) => {
      const totalsFor = availabilityOf(totals, item.id);
      const cost = costOf(item);
      return { itemId: item.id, sku: item.sku, name: item.name, onHand: totalsFor.onHand, avgCostMinor: cost, valueMinor: totalsFor.onHand * cost, inTransit: totalsFor.inTransit, inTransitMinor: totalsFor.inTransit * cost };
    })
    .filter((row) => row.onHand > 0 || row.inTransit > 0)
    .sort((a, b) => b.valueMinor - a.valueMinor || a.name.localeCompare(b.name));
  return {
    currency: space.currency,
    totalMinor: rows.reduce((sum, row) => sum + row.valueMinor, 0),
    inTransitMinor: rows.reduce((sum, row) => sum + row.inTransitMinor, 0),
    byCategory: [...categories.values()].sort((a, b) => b.valueMinor - a.valueMinor),
    byLocation: [...locations.values()].sort((a, b) => a.code.localeCompare(b.code)),
    items: rows,
  };
}

export function valuationTables(report: ValuationReport): ReportTable[] {
  return [
    {
      title: "Valuation by item",
      columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "onHand", label: "On hand", kind: "number" }, { key: "cost", label: "Average cost", kind: "money" }, { key: "value", label: "Value", kind: "money" }, { key: "inTransit", label: "In transit", kind: "number" }, { key: "inTransitValue", label: "In transit value", kind: "money" }],
      rows: report.items.map((row) => ({ sku: row.sku, name: row.name, onHand: row.onHand, cost: row.avgCostMinor, value: row.valueMinor, inTransit: row.inTransit, inTransitValue: row.inTransitMinor })),
    },
    {
      title: "Valuation by category",
      columns: [{ key: "name", label: "Category" }, { key: "onHand", label: "On hand", kind: "number" }, { key: "value", label: "Value", kind: "money" }],
      rows: report.byCategory.map((row) => ({ name: row.name, onHand: row.onHand, value: row.valueMinor })),
    },
    {
      title: "Valuation by location",
      columns: [{ key: "code", label: "Code" }, { key: "name", label: "Location" }, { key: "onHand", label: "On hand", kind: "number" }, { key: "value", label: "Value", kind: "money" }],
      rows: report.byLocation.map((row) => ({ code: row.code, name: row.name, onHand: row.onHand, value: row.valueMinor })),
    },
  ];
}

export type LowStockRow = { itemId: string; sku: string; name: string; available: number; reorderPoint: number; reorderQuantity: number | null; onOrder: number; supplier: string | null };

/** Active items at or below their reorder point, most short first, with what is already on the buy list. */
export async function lowStockReport(spaceId: string): Promise<LowStockRow[]> {
  const rows = await reorderSuggestions(spaceId);
  return rows.map((row) => ({
    itemId: row.id,
    sku: row.sku,
    name: row.name,
    available: row.available,
    reorderPoint: row.reorderPoint ?? 0,
    reorderQuantity: row.reorderQuantity ?? null,
    onOrder: row.onOrder,
    supplier: row.supplier?.name ?? null,
  }));
}

export function lowStockTables(rows: LowStockRow[]): ReportTable[] {
  return [{
    title: "Low stock",
    columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "available", label: "Available", kind: "number" }, { key: "reorderPoint", label: "Reorder point", kind: "number" }, { key: "reorderQuantity", label: "Reorder quantity", kind: "number" }, { key: "onOrder", label: "On the buy list", kind: "number" }, { key: "supplier", label: "Supplier" }],
    rows: rows.map((row) => ({ sku: row.sku, name: row.name, available: row.available, reorderPoint: row.reorderPoint, reorderQuantity: row.reorderQuantity, onOrder: row.onOrder, supplier: row.supplier })),
  }];
}
