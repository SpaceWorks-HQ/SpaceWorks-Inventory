import "server-only";

import type { FinanceCategory, FinanceDirection, FinanceEntry, FinanceMethod } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { MANUAL_CATEGORIES, needsReference } from "./labels";

/**
 * The finance ledger's only writer. Every money movement posts one entry in
 * the same transaction as its source (a settled payment, a processed refund,
 * a repair payout, a bought purchase) or by hand. Entries are append-only
 * (database trigger); a mistake is corrected with a reversing entry.
 */

export type FinanceSource = { type: "Payment" | "Refund" | "RepairPayout" | "PurchaseItem" | "Manual" | "Reversal"; id: string };

export type PostInput = {
  spaceId: string;
  direction: FinanceDirection;
  category: FinanceCategory;
  amountMinor: number;
  currency: string;
  method: FinanceMethod;
  reference?: string | null;
  occurredAt: Date;
  source: FinanceSource;
  actorId?: string | null;
  note?: string | null;
  itemId?: string | null;
  assetId?: string | null;
  technicianId?: string | null;
  supplierId?: string | null;
  reversesId?: string | null;
};

/**
 * Post one entry. Idempotent per source: a retried webhook or a second call
 * returns the entry already posted. Refuses an amount that isn't a whole
 * positive number of minor units and any currency but the space's own.
 */
export async function postFinanceEntry(tx: Tx, input: PostInput): Promise<FinanceEntry> {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new DomainError("Enter an amount above zero.");
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { currency: true } });
  if (input.currency.toUpperCase() !== space.currency.toUpperCase()) throw new DomainError(`This space keeps its books in ${space.currency}. Record the amount in ${space.currency}.`);
  const existing = await tx.financeEntry.findUnique({ where: { sourceType_sourceId: { sourceType: input.source.type, sourceId: input.source.id } } });
  if (existing) return existing;
  const entry = await tx.financeEntry.create({
    data: {
      spaceId: input.spaceId,
      direction: input.direction,
      category: input.category,
      amountMinor: input.amountMinor,
      currency: space.currency,
      method: input.method,
      reference: input.reference?.trim().slice(0, 120) || null,
      occurredAt: input.occurredAt,
      sourceType: input.source.type,
      sourceId: input.source.id,
      actorId: input.actorId ?? null,
      note: input.note?.trim().slice(0, 500) || null,
      itemId: input.itemId ?? null,
      assetId: input.assetId ?? null,
      technicianId: input.technicianId ?? null,
      supplierId: input.supplierId ?? null,
      reversesId: input.reversesId ?? null,
    },
  });
  await emitEvent(tx, {
    spaceId: input.spaceId,
    type: "finance.entry_posted",
    data: { entryId: entry.id, direction: entry.direction, category: entry.category, amountMinor: entry.amountMinor, currency: entry.currency, sourceType: entry.sourceType, sourceId: entry.sourceId },
  });
  return entry;
}

export type ManualEntryInput = {
  spaceId: string;
  direction: FinanceDirection;
  category: FinanceCategory;
  amountMinor: number;
  method: FinanceMethod;
  reference: string | null;
  occurredAt: Date;
  note: string;
  actorId: string;
};

/** Other income or an expense (rent, utilities…) recorded by an inventory manager. Audited. */
export async function createManualEntry(tx: Tx, input: ManualEntryInput) {
  if (!MANUAL_CATEGORIES[input.direction].includes(input.category)) throw new DomainError("Choose a category for this kind of entry.");
  if (input.method === "GATEWAY_RAZORPAY" || input.method === "GATEWAY_STRIPE") throw new DomainError("Gateway money is recorded by its payment. Choose cash, bank transfer, UPI or other.");
  if (needsReference(input.method) && !input.reference?.trim()) throw new DomainError("Add the transaction reference (except for cash).");
  if (!input.note.trim()) throw new DomainError("Say what this money was for.");
  if (input.occurredAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) throw new DomainError("The date can't be in the future.");
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId }, select: { currency: true } });
  const id = crypto.randomUUID();
  const entry = await postFinanceEntry(tx, { ...input, currency: space.currency, source: { type: "Manual", id } });
  await recordAuditEvent({ client: tx, action: "finance.entry_created", spaceId: input.spaceId, actorId: input.actorId, targetType: "FinanceEntry", targetId: entry.id, metadata: { direction: entry.direction, category: entry.category, amountMinor: entry.amountMinor } });
  return entry;
}

/**
 * Correct a mistake: post the opposite movement for the same amount, with a
 * reason. Each entry can be reversed once, and a reversal is never reversed.
 */
export async function reverseFinanceEntry(tx: Tx, input: { spaceId: string; entryId: string; reason: string; actorId: string }) {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FinanceEntry" WHERE "id" = ${input.entryId} AND "spaceId" = ${input.spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That entry wasn't found.", "not_found");
  const entry = await tx.financeEntry.findUniqueOrThrow({ where: { id: input.entryId } });
  if (entry.reversesId) throw new DomainError("A reversal can't be reversed. Post a new entry instead.", "conflict");
  if (await tx.financeEntry.findUnique({ where: { reversesId: entry.id }, select: { id: true } })) throw new DomainError("This entry was already reversed.", "conflict");
  const reason = input.reason.trim();
  if (!reason) throw new DomainError("Say why this entry is reversed.");
  const reversal = await postFinanceEntry(tx, {
    spaceId: entry.spaceId,
    direction: entry.direction === "IN" ? "OUT" : "IN",
    category: entry.category,
    amountMinor: entry.amountMinor,
    currency: entry.currency,
    method: entry.method,
    reference: entry.reference,
    occurredAt: new Date(),
    source: { type: "Reversal", id: entry.id },
    actorId: input.actorId,
    note: reason,
    itemId: entry.itemId,
    assetId: entry.assetId,
    technicianId: entry.technicianId,
    supplierId: entry.supplierId,
    reversesId: entry.id,
  });
  await recordAuditEvent({ client: tx, action: "finance.entry_reversed", spaceId: input.spaceId, actorId: input.actorId, targetType: "FinanceEntry", targetId: entry.id, metadata: { reversalId: reversal.id, amountMinor: entry.amountMinor } });
  return reversal;
}
