import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, type Db, type Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { flattenZodErrors } from "@/lib/actionResult";
import { DomainError, notFound } from "@/lib/domainError";
import { OPEN_TRANSFER_STATUSES } from "@/lib/transfers/policy";
import { tagPrefixTaken } from "@/lib/spaces";
import { changedKeys, isSettingsSection, SETTINGS_SECTIONS } from "@/lib/settings/sections";

export type SaveSectionResult = { ok: true; changed: string[] } | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Validate and save one settings section. The caller has already checked
 * the actor's role against `SETTINGS_SECTIONS[section].minRole`. Changes
 * are compared with a fresh read inside the transaction and audited with
 * the changed field names only (never the values).
 */
export async function saveSettingsSection(client: Db, space: { id: string }, section: string, input: unknown, actorId: string | null): Promise<SaveSectionResult> {
  if (!isSettingsSection(section)) return { ok: false, error: "That settings section doesn't exist." };
  const parsed = SETTINGS_SECTIONS[section].schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the highlighted fields.", fieldErrors: flattenZodErrors(parsed.error) };
  const data = parsed.data as Record<string, unknown>;
  return client.$transaction(async (tx) => {
    const before = await tx.space.findUnique({ where: { id: space.id } });
    if (!before) return { ok: false as const, error: "That space wasn't found." };
    const changed = changedKeys(before as unknown as Record<string, unknown>, data);
    if (changed.length === 0) return { ok: true as const, changed };
    if (changed.includes("tagPrefix") && (await tagPrefixTaken(tx, String(data.tagPrefix), space.id))) {
      const error = "Another space already uses this prefix.";
      return { ok: false as const, error, fieldErrors: { tagPrefix: [error] } as Record<string, string[]> };
    }
    // The books never mix currencies: once money is recorded the currency stays.
    if (changed.includes("currency") && ((await tx.financeEntry.count({ where: { spaceId: space.id }, take: 1 })) > 0 || (await tx.payment.count({ where: { spaceId: space.id }, take: 1 })) > 0)) {
      const error = "The currency can't change once money has been recorded in this space.";
      return { ok: false as const, error, fieldErrors: { currency: [error] } as Record<string, string[]> };
    }
    await tx.space.update({ where: { id: space.id }, data: data as Prisma.SpaceUpdateInput });
    await recordAuditEvent({
      client: tx,
      action: "settings.updated",
      spaceId: space.id,
      actorId,
      targetType: "Space",
      targetId: space.id,
      metadata: { section, fields: changed.join(",") },
    });
    return { ok: true as const, changed };
  });
}

/**
 * Delete a space and everything in it. Refused while a transfer with
 * another space is still open (the other side holds reservations for it).
 * The audit row is written without a space id so it outlives the cascade.
 * Returns the storage keys to remove once the transaction has committed.
 */
export async function deleteSpace(spaceId: string, actorId: string | null): Promise<{ storageKeys: string[] }> {
  return prisma.$transaction(async (tx) => {
    const space = await tx.space.findUnique({ where: { id: spaceId }, select: { id: true, slug: true, name: true, logoKey: true } });
    if (!space) notFound("space");
    const openWithOthers = await tx.transfer.count({
      where: {
        status: { in: [...OPEN_TRANSFER_STATUSES] },
        OR: [{ sourceSpaceId: spaceId, NOT: { destSpaceId: spaceId } }, { destSpaceId: spaceId, NOT: { sourceSpaceId: spaceId } }],
      },
    });
    if (openWithOthers > 0) throw new DomainError("Finish or cancel the open transfers with other spaces first.", "conflict");
    const [images, photos, repairPhotos] = await Promise.all([
      tx.itemImage.findMany({ where: { spaceId }, select: { storageKey: true } }),
      tx.evidencePhoto.findMany({ where: { evidence: { spaceId } }, select: { storageKey: true } }),
      tx.repairPhoto.findMany({ where: { spaceId }, select: { storageKey: true } }),
    ]);
    await recordAuditEvent({ client: tx, action: "space.deleted", spaceId: null, actorId, targetType: "Space", targetId: space.id, metadata: { slug: space.slug, name: space.name } });
    // Loans keep their borrower with NoAction, so they go before the space cascade.
    await tx.loan.deleteMany({ where: { spaceId } });
    await tx.space.delete({ where: { id: spaceId } });
    const storageKeys = [...images, ...photos, ...repairPhotos].map((row) => row.storageKey);
    if (space.logoKey) storageKeys.push(space.logoKey);
    return { storageKeys };
  }, { timeout: 60_000, maxWait: 10_000 });
}

/** Archived suppliers drop out of pickers; items keep their link. */
export async function setSupplierArchived(tx: Tx, spaceId: string, supplierId: string, archived: boolean, actor: { userId: string | null }) {
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, spaceId }, select: { id: true } });
  if (!supplier) notFound("supplier");
  await tx.supplier.update({ where: { id: supplierId }, data: { archivedAt: archived ? new Date() : null } });
  await recordAuditEvent({ client: tx, action: archived ? "supplier.archived" : "supplier.restored", spaceId, actorId: actor.userId, targetType: "Supplier", targetId: supplierId });
}
