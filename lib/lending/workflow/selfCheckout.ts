import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import { nextSpaceSequence } from "@/lib/counters";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { availableOf, lockLevels, takeAsset, takeFree } from "@/lib/inventory/availability";
import { notifyUsers, staffIds } from "@/lib/notify";
import { assertIssueAllowed, createLoanCharges, payLaterForLoan } from "@/lib/payments/charges";
import { checkBorrowingEligibility } from "../access";
import { addDays, loanDaysFor } from "../policy";
import { loanUrl, type Actor } from "./common";
import { resolveScans } from "./scans";

/**
 * A member checks items out themselves by scanning their labels (one unit
 * per item label, one asset per asset label) and photographing them. Only
 * items marked self-checkout, in a space that allows it, for members in good
 * standing. Fees must be zero or pay-later must be allowed.
 */
export async function selfCheckout(tx: Tx, input: { spaceId: string; borrowerId: string; scannedCodes: string[]; quantities?: Record<string, number>; evidence: EvidenceInput }, actor: Actor) {
  const space = await tx.space.findUniqueOrThrow({ where: { id: input.spaceId } });
  if (!space.lendingEnabled || !space.selfCheckoutEnabled) throw new DomainError("Self-checkout is switched off in this space.", "forbidden");
  const scans = await resolveScans(tx, input.spaceId, input.scannedCodes);
  if (scans.containers.length) throw new DomainError("Self-checkout works with item and asset labels only.", "invalid");
  const assets = [...scans.assets.values()];
  const itemIds = [...new Set([...scans.items, ...assets.map((a) => a.itemId)])];
  if (itemIds.length === 0) throw new DomainError("Scan the labels of what you're taking.", "invalid");
  const items = await tx.item.findMany({ where: { id: { in: itemIds }, spaceId: input.spaceId, archivedAt: null, lendable: true, selfCheckout: true }, select: { id: true, name: true, tracking: true, consumable: true, loanDays: true, category: { select: { loanDays: true } } } });
  if (items.length !== itemIds.length) throw new DomainError("One of those items has to be issued at the desk.", "forbidden");
  const quantityFor = (itemId: string) => Math.max(1, Math.min(input.quantities?.[itemId] ?? 1, 20));
  const units = items.reduce((sum, item) => sum + (item.tracking === "SERIALIZED" ? assets.filter((a) => a.itemId === item.id).length : quantityFor(item.id)), 0);
  const eligible = await checkBorrowingEligibility(tx, { spaceId: input.spaceId, userId: input.borrowerId, incomingUnits: units });
  if (!eligible.ok) throw new DomainError(eligible.error, "forbidden");
  if (items.some((item) => item.tracking === "SERIALIZED" && scans.items.has(item.id))) throw new DomainError("Scan the asset label on the tool itself, not the shelf label.", "invalid");

  const now = new Date();
  const loan = await tx.loan.create({
    data: { spaceId: input.spaceId, number: await nextSpaceSequence(tx, input.spaceId, "loan"), borrowerId: input.borrowerId, selfCheckout: true, status: "APPROVED", approvedAt: now, dueAt: addDays(now, loanDaysFor(space, items)) },
  });
  const ref = { refType: "Loan", refId: loan.id };
  for (const item of items) {
    if (item.tracking === "SERIALIZED") {
      for (const asset of assets.filter((a) => a.itemId === item.id)) {
        await takeAsset(tx, { spaceId: input.spaceId, assetId: asset.id, itemId: item.id, to: "ON_LOAN", type: "ISSUE" }, actor, ref);
        await tx.loanLine.create({ data: { loanId: loan.id, itemId: item.id, assetId: asset.id, locationId: asset.locationId, quantityRequested: 1, quantityApproved: 1, quantityIssued: 1 } });
      }
      continue;
    }
    const quantity = quantityFor(item.id);
    const levels = await tx.stockLevel.findMany({ where: { itemId: item.id, spaceId: input.spaceId }, select: { locationId: true } });
    const locked = [...(await lockLevels(tx, input.spaceId, levels.map((l) => ({ itemId: item.id, locationId: l.locationId })))).values()].sort((a, b) => availableOf(b) - availableOf(a));
    const from = locked[0];
    if (!from || availableOf(from) < quantity) throw new DomainError(`${item.name} isn't free to take right now.`, "conflict");
    await takeFree(tx, { spaceId: input.spaceId, itemId: item.id, locationId: from.locationId, quantity, type: "ISSUE" }, actor, ref);
    await tx.loanLine.create({ data: { loanId: loan.id, itemId: item.id, locationId: from.locationId, quantityRequested: quantity, quantityApproved: quantity, quantityIssued: quantity, quantityConsumed: item.consumable ? quantity : 0 } });
  }
  await createLoanCharges(tx, { loanId: loan.id });
  if (await tx.loanCharge.count({ where: { loanId: loan.id, status: "DUE" } })) {
    if (!space.payLaterEnabled) throw new DomainError("These items have a deposit or fee; borrow them at the desk.", "forbidden");
    await payLaterForLoan(tx, { loanId: loan.id, payerId: input.borrowerId });
  }
  await assertIssueAllowed(tx, { loanId: loan.id });
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId: input.spaceId, kind: "ISSUE", loanId: loan.id, actorId: actor.userId, minPhotos: space.minEvidencePhotos, remarksRequired: false });
  const allConsumed = items.every((item) => item.consumable);
  await tx.loan.update({ where: { id: loan.id }, data: { status: allConsumed ? "RETURNED" : "ISSUED", issuedAt: now, issuedById: actor.userId, ...(allConsumed ? { returnedAt: now } : {}) } });
  await recordAuditEvent({ client: tx, action: "loan.self_checkout", spaceId: input.spaceId, actorId: actor.userId, targetType: "Loan", targetId: loan.id, metadata: { units, evidenceId: evidence.id } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.issued", data: { loanId: loan.id, reference: loanRef(loan.number), units, dueAt: loan.dueAt.toISOString(), selfCheckout: true } });
  await notifyUsers(tx, input.spaceId, await staffIds(tx, input.spaceId), { kind: "loan.self_checkout", title: `Self-checkout ${loanRef(loan.number)}`, body: items.map((i) => i.name).slice(0, 3).join(", "), url: loanUrl(space.slug, loan.id, "staff") }, { excludeUserId: input.borrowerId });
  return loan;
}
