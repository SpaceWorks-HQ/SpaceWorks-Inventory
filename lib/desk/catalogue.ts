import "server-only";

import { prisma } from "@/lib/db";
import { availabilityFor, availabilityOf } from "@/lib/inventory/availability";
import { describeItemFees, type SpaceFeePolicy } from "@/lib/payments/fees";
import { availabilityWord } from "./catalogueWords";

type CatalogueSpace = SpaceFeePolicy & { id: string; slug: string; timezone: string; currency: string };

/**
 * What members can borrow: lendable, active items with a photo, an
 * availability word and the fees in words; plus lendable kits whose items
 * can all be borrowed.
 */
export async function borrowCatalogue(space: CatalogueSpace, now: Date = new Date()) {
  const items = await prisma.item.findMany({
    where: { spaceId: space.id, lendable: true, archivedAt: null },
    orderBy: { name: "asc" },
    take: 500,
    select: {
      id: true, name: true, sku: true, description: true, brand: true, model: true, tags: true, tracking: true, consumable: true, selfCheckout: true,
      depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true,
      category: { select: { id: true, name: true, depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true } },
      unit: { select: { symbol: true } },
      images: { select: { id: true }, orderBy: { sortOrder: "asc" }, take: 1 },
    },
  });
  const ids = items.map((item) => item.id);
  const [availability, out, kits] = await Promise.all([
    availabilityFor(space.id, ids),
    ids.length ? prisma.loanLine.findMany({
      where: { itemId: { in: ids }, loan: { spaceId: space.id, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } } },
      select: { itemId: true, quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true, quantityConsumed: true, loan: { select: { dueAt: true } } },
    }) : [],
    prisma.kit.findMany({ where: { spaceId: space.id, lendable: true, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, lines: { select: { itemId: true, quantity: true } } } }),
  ]);
  const earliest = new Map<string, Date>();
  for (const line of out) {
    if (line.quantityIssued - line.quantityReturned - line.quantityDamaged - line.quantityLost - line.quantityConsumed <= 0) continue;
    const current = earliest.get(line.itemId);
    if (!current || line.loan.dueAt < current) earliest.set(line.itemId, line.loan.dueAt);
  }
  const rows = items.map((item) => {
    const available = Math.max(0, availabilityOf(availability, item.id).available);
    const word = availabilityWord({ available, earliestDue: earliest.get(item.id) ?? null }, space.timezone, now);
    return {
      id: item.id,
      name: item.name,
      sku: item.sku,
      description: item.description,
      brand: item.brand,
      model: item.model,
      tags: item.tags,
      consumable: item.consumable,
      categoryId: item.category?.id ?? null,
      category: item.category?.name ?? null,
      unitSymbol: item.unit?.symbol ?? null,
      imageUrl: item.images[0] ? `/api/s/${encodeURIComponent(space.slug)}/images/${item.images[0].id}` : null,
      available,
      availability: word,
      fees: describeItemFees(space, item, item.category, space.currency),
    };
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const bundles = kits
    .filter((kit) => kit.lines.length > 0 && kit.lines.every((line) => byId.has(line.itemId)))
    .map((kit) => ({
      id: kit.id,
      name: kit.name,
      description: kit.description,
      lines: kit.lines.map((line) => ({ itemId: line.itemId, quantity: line.quantity, name: byId.get(line.itemId)!.name })),
      ready: kit.lines.every((line) => byId.get(line.itemId)!.available >= line.quantity),
    }));
  const categories = [...new Map(rows.filter((row) => row.categoryId).map((row) => [row.categoryId!, row.category!])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { items: rows, kits: bundles, categories };
}

/** Items a member may check out themselves, with the codes they can scan. */
export async function selfCheckoutCatalog(spaceId: string) {
  const items = await prisma.item.findMany({
    where: { spaceId, lendable: true, selfCheckout: true, archivedAt: null },
    orderBy: { name: "asc" },
    take: 300,
    select: { id: true, name: true, qrCode: true, tracking: true, assets: { where: { status: "AVAILABLE" }, select: { qrCode: true, assetTag: true }, take: 100 } },
  });
  return items.map((item) => ({
    itemId: item.id,
    name: item.name,
    code: item.qrCode,
    tracking: item.tracking,
    assets: item.assets.map((asset) => ({ code: asset.qrCode, label: `${item.name} · ${asset.assetTag}` })),
  }));
}
