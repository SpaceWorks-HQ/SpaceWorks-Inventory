import "server-only";

import { prisma } from "@/lib/db";
import { resolveScan } from "@/lib/catalogue/resolve";
import { loanRef, transferRef } from "@/lib/catalogue/references";
import { LOAN_STATUS_LABEL } from "@/lib/lending/policy";
import { TRANSFER_STATUS_LABEL } from "@/lib/transfers/policy";

export type ScanHolder = { kind: "loan" | "transfer"; label: string; status: string; href: string };
export type ScanTarget = { kind: "item" | "asset" | "location" | "kit" | "container"; code: string; label: string; href: string; status: string | null; holders: ScanHolder[] };

const ASSET_STATUS_WORD: Record<string, string> = { AVAILABLE: "Available", RESERVED: "Held", ON_LOAN: "On loan", IN_TRANSIT: "In transit", MAINTENANCE: "Under repair", LOST: "Lost", RETIRED: "Retired" };
const OPEN_LOANS = ["APPROVED", "ISSUED", "PARTIALLY_RETURNED"] as const;
const MOVING_TRANSFERS = ["APPROVED", "DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"] as const;

/**
 * What a scanned label is inside this space, where its page is, and the open
 * loans or transfers holding it. Codes from other spaces resolve to null,
 * exactly like unknown codes.
 */
export async function scanTarget(slug: string, spaceId: string, raw: string): Promise<ScanTarget | null> {
  const resolved = await resolveScan(spaceId, raw);
  if (!resolved) return null;
  const base = `/s/${encodeURIComponent(slug)}`;
  const loanHolder = (loan: { id: string; number: number; status: keyof typeof LOAN_STATUS_LABEL }): ScanHolder => ({ kind: "loan", label: loanRef(loan.number), status: LOAN_STATUS_LABEL[loan.status], href: `${base}/loans/${loan.id}` });
  const transferHolder = (transfer: { id: string; number: number; status: keyof typeof TRANSFER_STATUS_LABEL }): ScanHolder => ({ kind: "transfer", label: transferRef(transfer.number), status: TRANSFER_STATUS_LABEL[transfer.status], href: `${base}/transfers/${transfer.id}` });
  const loanSelect = { id: true, number: true, status: true } as const;
  switch (resolved.kind) {
    case "asset": {
      const [loans, transfers] = await Promise.all([
        prisma.loan.findMany({ where: { spaceId, status: { in: [...OPEN_LOANS] }, lines: { some: { assetId: resolved.id } } }, select: loanSelect, take: 3 }),
        prisma.transfer.findMany({ where: { status: { in: [...MOVING_TRANSFERS] }, OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }], lines: { some: { assets: { some: { assetId: resolved.id, state: { in: ["ASSIGNED", "DISPATCHED", "RETURNING"] } } } } } }, select: loanSelect, take: 3 }),
      ]);
      return { kind: "asset", code: resolved.code, label: resolved.label, href: `${base}/assets/${resolved.id}`, status: ASSET_STATUS_WORD[resolved.status] ?? null, holders: [...loans.map(loanHolder), ...transfers.map(transferHolder)] };
    }
    case "item": {
      const [loans, transfers] = await Promise.all([
        prisma.loan.findMany({ where: { spaceId, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, lines: { some: { itemId: resolved.itemId } } }, select: loanSelect, orderBy: { dueAt: "asc" }, take: 5 }),
        prisma.transfer.findMany({ where: { sourceSpaceId: spaceId, status: { in: [...MOVING_TRANSFERS] }, lines: { some: { itemId: resolved.itemId } } }, select: loanSelect, take: 5 }),
      ]);
      return { kind: "item", code: resolved.code, label: resolved.label, href: `${base}/items/${resolved.itemId}`, status: null, holders: [...loans.map(loanHolder), ...transfers.map(transferHolder)] };
    }
    case "container": {
      const loans = await prisma.loan.findMany({ where: { spaceId, containerId: resolved.id, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } }, select: loanSelect, take: 1 });
      return { kind: "container", code: resolved.code, label: resolved.label, href: `${base}/kits?container=${resolved.id}`, status: loans.length ? "Out on a loan" : "Free", holders: loans.map(loanHolder) };
    }
    case "location":
      return { kind: "location", code: resolved.code, label: resolved.label, href: `${base}/stock?location=${resolved.id}`, status: null, holders: [] };
    case "kit":
      return { kind: "kit", code: resolved.code, label: resolved.label, href: `${base}/kits`, status: null, holders: [] };
  }
}
