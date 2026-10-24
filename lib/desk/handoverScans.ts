import "server-only";

import { prisma } from "@/lib/db";
import { loanDaysFor } from "@/lib/lending/policy";
import { selfCheckoutPaymentReady } from "@/lib/payments/readiness";
import { normalizeScan } from "./scanCodes";

/** What one scanned code means inside a handover. `unavailable` codes are refused at once. */
export type HandoverScan = { code: string; kind: "asset" | "container"; itemId: string | null; label: string; unavailable: boolean };

const ACTIVE_LOAN = ["ISSUED", "PARTIALLY_RETURNED"] as const;

/**
 * Resolve a code the preloaded issue catalogue didn't include (spaces with
 * hundreds of tags), with the same rules as `issueScanCatalog`: an asset tag
 * of a serialized item on this approved loan (free only when AVAILABLE), or a
 * container of this space (busy while out on a loan). Every lookup is scoped
 * to the space; anything else answers null, the same as an unknown code.
 */
export async function resolveIssueScan(spaceId: string, loanId: string, raw: string): Promise<HandoverScan | null> {
  const code = normalizeScan(raw);
  if (!code) return null;
  const loan = await prisma.loan.findFirst({ where: { id: loanId, spaceId, status: "APPROVED" }, select: { lines: { select: { itemId: true, item: { select: { tracking: true } } } } } });
  if (!loan) return null;
  if (code.startsWith("A")) {
    const itemIds = loan.lines.filter((line) => line.item.tracking === "SERIALIZED").map((line) => line.itemId);
    if (!itemIds.length) return null;
    const asset = await prisma.asset.findFirst({ where: { spaceId, qrCode: code, itemId: { in: itemIds } }, select: { itemId: true, assetTag: true, status: true, item: { select: { name: true } } } });
    if (!asset) return null;
    return { code, kind: "asset", itemId: asset.itemId, label: `${asset.item.name} · ${asset.assetTag}`, unavailable: asset.status !== "AVAILABLE" };
  }
  if (code.startsWith("C")) {
    const container = await prisma.container.findFirst({
      where: { spaceId, qrCode: code, archivedAt: null },
      select: { code: true, name: true, loans: { where: { spaceId, status: { in: [...ACTIVE_LOAN] } }, select: { id: true }, take: 1 } },
    });
    if (!container) return null;
    return { code, kind: "container", itemId: null, label: container.name ? `Container ${container.code} · ${container.name}` : `Container ${container.code}`, unavailable: container.loans.length > 0 };
  }
  return null;
}

/**
 * Resolve an asset tag for dispatch with the rules of `pickableAssets`: a tag
 * of an item on this approved transfer, in the source space (this space),
 * that is free or held for it.
 */
export async function resolveDispatchScan(spaceId: string, transferId: string, raw: string): Promise<HandoverScan | null> {
  const code = normalizeScan(raw);
  if (!code?.startsWith("A")) return null;
  const transfer = await prisma.transfer.findFirst({ where: { id: transferId, sourceSpaceId: spaceId, status: "APPROVED" }, select: { lines: { where: { quantityApproved: { gt: 0 } }, select: { itemId: true } } } });
  if (!transfer?.lines.length) return null;
  const asset = await prisma.asset.findFirst({
    where: { spaceId, qrCode: code, itemId: { in: transfer.lines.map((line) => line.itemId) } },
    select: { itemId: true, assetTag: true, status: true, item: { select: { name: true } } },
  });
  if (!asset) return null;
  return { code, kind: "asset", itemId: asset.itemId, label: `${asset.item.name} · ${asset.assetTag}`, unavailable: asset.status !== "AVAILABLE" && asset.status !== "RESERVED" };
}

/** A code a member scanned at self-checkout that the page didn't preload. */
export type SelfCheckoutScan = { code: string; kind: "item" | "asset"; itemId: string; itemName: string; tracking: "QUANTITY" | "SERIALIZED"; label: string; unavailable: boolean };

const SELF_CHECKOUT_ITEM = {
  id: true, name: true, qrCode: true, tracking: true, consumable: true, loanDays: true,
  depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true,
  category: { select: { loanDays: true, depositMinor: true, rentalMode: true, rentalMinor: true, lateFeePerDayMinor: true } },
} as const;

/**
 * Resolve a self-checkout scan with the rules of `selfCheckoutCatalog` (which
 * preloads at most 300 items and 100 tags each): a lendable, self-checkout item
 * of this space (its label when tracked by quantity, an available tag when
 * serialized). Items the payment rules keep at the desk come back unavailable.
 */
export async function resolveSelfCheckoutScan(spaceId: string, raw: string): Promise<SelfCheckoutScan | null> {
  const code = normalizeScan(raw);
  if (!code || (!code.startsWith("I") && !code.startsWith("A"))) return null;
  const space = await prisma.space.findUnique({ where: { id: spaceId } });
  if (!space?.lendingEnabled || !space.selfCheckoutEnabled) return null;
  const eligibleItem = { spaceId, lendable: true, selfCheckout: true, archivedAt: null };
  const asset = code.startsWith("A")
    ? await prisma.asset.findFirst({ where: { spaceId, qrCode: code, item: eligibleItem }, select: { assetTag: true, status: true, item: { select: SELF_CHECKOUT_ITEM } } })
    : null;
  const item = asset?.item ?? (code.startsWith("I") ? await prisma.item.findFirst({ where: { ...eligibleItem, qrCode: code, tracking: "QUANTITY" }, select: SELF_CHECKOUT_ITEM }) : null);
  if (!item) return null;
  const payable = selfCheckoutPaymentReady(space, [{ quantity: 1, item, category: item.category }], loanDaysFor(space, [item]));
  const label = asset ? `${item.name} · ${asset.assetTag}` : item.name;
  return { code, kind: asset ? "asset" : "item", itemId: item.id, itemName: item.name, tracking: item.tracking, label, unavailable: !payable || (asset !== null && asset.status !== "AVAILABLE") };
}
