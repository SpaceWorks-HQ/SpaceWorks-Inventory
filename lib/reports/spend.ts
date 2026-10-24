import "server-only";

import { prisma } from "@/lib/db";
import type { ReportTable } from "./table";

/**
 * What each item and asset has cost the space, all time, from the finance
 * ledger (purchases and repair payouts, net of reversals) and asset
 * purchase costs. Added to the valuation report for inventory managers.
 */
export async function spendReport(spaceId: string) {
  const [entries, assets, repairsByAsset] = await Promise.all([
    prisma.financeEntry.groupBy({ by: ["itemId", "category", "direction"], where: { spaceId, itemId: { not: null }, category: { in: ["PURCHASE", "REPAIR"] } }, _sum: { amountMinor: true } }),
    prisma.asset.findMany({ where: { spaceId, purchaseCostMinor: { gt: 0 } }, select: { id: true, assetTag: true, purchaseCostMinor: true, item: { select: { name: true } } } }),
    prisma.financeEntry.groupBy({ by: ["assetId", "direction"], where: { spaceId, assetId: { not: null }, category: "REPAIR" }, _sum: { amountMinor: true } }),
  ]);
  const items = new Map<string, { purchasesMinor: number; repairsMinor: number }>();
  for (const row of entries) {
    const entry = items.get(row.itemId!) ?? { purchasesMinor: 0, repairsMinor: 0 };
    const amount = (row._sum.amountMinor ?? 0) * (row.direction === "OUT" ? 1 : -1);
    if (row.category === "PURCHASE") entry.purchasesMinor += amount;
    else entry.repairsMinor += amount;
    items.set(row.itemId!, entry);
  }
  const names = await prisma.item.findMany({ where: { id: { in: [...items.keys()] }, spaceId }, select: { id: true, name: true, sku: true } });
  const assetRepairs = new Map<string, number>();
  for (const row of repairsByAsset) assetRepairs.set(row.assetId!, (assetRepairs.get(row.assetId!) ?? 0) + (row._sum.amountMinor ?? 0) * (row.direction === "OUT" ? 1 : -1));
  const repairedAssets = await prisma.asset.findMany({ where: { id: { in: [...assetRepairs.keys()].filter((id) => !assets.some((asset) => asset.id === id)) }, spaceId }, select: { id: true, assetTag: true, purchaseCostMinor: true, item: { select: { name: true } } } });
  return {
    items: names.map((item) => ({ name: item.name, sku: item.sku, ...items.get(item.id)! })).sort((a, b) => b.purchasesMinor + b.repairsMinor - (a.purchasesMinor + a.repairsMinor)),
    assets: [...assets, ...repairedAssets]
      .map((asset) => ({ tag: asset.assetTag, item: asset.item.name, purchaseMinor: asset.purchaseCostMinor ?? 0, repairsMinor: assetRepairs.get(asset.id) ?? 0 }))
      .sort((a, b) => b.purchaseMinor + b.repairsMinor - (a.purchaseMinor + a.repairsMinor)),
  };
}

export type SpendReport = Awaited<ReturnType<typeof spendReport>>;

export function spendTables(report: SpendReport): ReportTable[] {
  return [
    {
      title: "Spend by item",
      columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Item" }, { key: "purchases", label: "Purchases", kind: "money" }, { key: "repairs", label: "Repairs", kind: "money" }, { key: "total", label: "Total spent", kind: "money" }],
      rows: report.items.map((row) => ({ sku: row.sku, name: row.name, purchases: row.purchasesMinor, repairs: row.repairsMinor, total: row.purchasesMinor + row.repairsMinor })),
    },
    {
      title: "Cost per asset",
      columns: [{ key: "tag", label: "Asset" }, { key: "item", label: "Item" }, { key: "purchase", label: "Purchase cost", kind: "money" }, { key: "repairs", label: "Repairs", kind: "money" }, { key: "total", label: "Total cost", kind: "money" }],
      rows: report.assets.map((row) => ({ tag: row.tag, item: row.item, purchase: row.purchaseMinor, repairs: row.repairsMinor, total: row.purchaseMinor + row.repairsMinor })),
    },
  ];
}
