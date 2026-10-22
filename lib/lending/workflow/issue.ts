import "server-only";

import type { Tx } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { loanRef } from "@/lib/catalogue/references";
import { DomainError } from "@/lib/domainError";
import { emitEvent } from "@/lib/events/emit";
import { recordEvidence, type EvidenceInput } from "@/lib/evidence";
import { releaseHolds, takeAsset, takeFromHolds } from "@/lib/inventory/availability";
import { notifyUsers } from "@/lib/notify";
import { assertIssueAllowed } from "@/lib/payments/charges";
import { formatDayLong } from "@/lib/format/datetime";
import { checkBorrowingEligibility } from "../access";
import { addDays } from "../policy";
import { lockLoan, loanUrl, type Actor, type LockedLoan } from "./common";
import { resolveScans, type ScanSet } from "./scans";

/** Check the container scan: required by policy, free (not on another active loan) and active. */
async function containerFor(tx: Tx, loan: LockedLoan, scans: ScanSet) {
  const container = scans.containers[0];
  if (!container) {
    if (loan.space.requireContainer) throw new DomainError("Pack the items in a container and scan its label.", "invalid");
    return null;
  }
  const busy = await tx.loan.findFirst({ where: { containerId: container.id, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } }, select: { number: true } });
  if (busy) throw new DomainError(`${container.label} is already out on ${loanRef(busy.number)}.`, "conflict");
  const row = await tx.container.findUniqueOrThrow({ where: { id: container.id }, select: { archivedAt: true } });
  if (row.archivedAt) throw new DomainError(`${container.label} is archived.`, "invalid");
  return container;
}

/** Hand serialized units over: one scanned asset per approved unit, each becoming its own line. */
async function issueSerializedLine(tx: Tx, loan: LockedLoan, line: LockedLoan["lines"][number], scans: ScanSet, actor: Actor) {
  const assets = [...scans.assets.values()].filter((asset) => asset.itemId === line.itemId);
  if (assets.length !== line.quantityApproved) {
    throw new DomainError(`Scan ${line.quantityApproved} ${line.item.name} ${line.quantityApproved === 1 ? "label" : "labels"} (${assets.length} scanned).`, "invalid");
  }
  await releaseHolds(tx, { spaceId: loan.spaceId, itemId: line.itemId, owner: { loanLineId: line.id } }, actor, { refType: "Loan", refId: loan.id });
  for (const [index, asset] of assets.entries()) {
    await takeAsset(tx, { spaceId: loan.spaceId, assetId: asset.id, itemId: line.itemId, to: "ON_LOAN", type: "ISSUE" }, actor, { refType: "Loan", refId: loan.id });
    const data = { assetId: asset.id, locationId: asset.locationId, quantityApproved: 1, quantityIssued: 1 };
    if (index === 0) await tx.loanLine.update({ where: { id: line.id }, data: { ...data, quantityRequested: 1 } });
    else await tx.loanLine.create({ data: { ...data, loanId: loan.id, itemId: line.itemId, quantityRequested: 1 } });
    scans.assets.delete(asset.id);
  }
}

/**
 * Staff hand an approved loan over. Needs the scan of every serialized unit
 * (and of the item label, or the container, for quantity items), photos and
 * remarks per the space evidence rules, eligibility and any payment due.
 */
export async function issueLoan(tx: Tx, input: { spaceId: string; loanId: string; scannedCodes: string[]; evidence: EvidenceInput }, actor: Actor) {
  const loan = await lockLoan(tx, input.spaceId, input.loanId, "issue");
  const units = loan.lines.reduce((sum, line) => sum + line.quantityApproved, 0);
  const eligible = await checkBorrowingEligibility(tx, { spaceId: input.spaceId, userId: loan.borrowerId, incomingUnits: units });
  if (!eligible.ok) throw new DomainError(eligible.error, "forbidden");
  await assertIssueAllowed(tx, { loanId: loan.id });
  const scans = await resolveScans(tx, input.spaceId, input.scannedCodes);
  const container = await containerFor(tx, loan, scans);
  let allConsumed = true;
  for (const line of loan.lines) {
    if (line.quantityApproved === 0) continue;
    if (line.item.tracking === "SERIALIZED") {
      await issueSerializedLine(tx, loan, line, scans, actor);
      allConsumed = false;
      continue;
    }
    if (!container && !scans.items.has(line.itemId)) throw new DomainError(`Scan the label of ${line.item.name} (or the container it is packed in).`, "invalid");
    const taken = await takeFromHolds(tx, { spaceId: input.spaceId, itemId: line.itemId, quantity: line.quantityApproved, owner: { loanLineId: line.id }, type: "ISSUE" }, actor, { refType: "Loan", refId: loan.id });
    await tx.loanLine.update({
      where: { id: line.id },
      data: { quantityIssued: line.quantityApproved, locationId: taken[0]?.locationId ?? null, quantityConsumed: line.item.consumable ? line.quantityApproved : 0 },
    });
    if (!line.item.consumable) allConsumed = false;
  }
  if (scans.assets.size > 0) throw new DomainError(`${[...scans.assets.values()][0]!.label} isn't on this loan.`, "invalid");
  const evidence = await recordEvidence(tx, { ...input.evidence, spaceId: input.spaceId, kind: "ISSUE", loanId: loan.id, actorId: actor.userId, minPhotos: loan.space.minEvidencePhotos, remarksRequired: loan.space.requireIssueRemarks });
  const now = new Date();
  // A late pickup keeps the full loan length.
  const lengthMs = loan.dueAt.getTime() - (loan.neededFrom ?? loan.approvedAt ?? loan.createdAt).getTime();
  const dueAt = loan.dueAt <= now ? addDays(now, Math.max(1, Math.round(lengthMs / 86_400_000))) : loan.dueAt;
  await tx.loan.update({
    where: { id: loan.id },
    data: { status: allConsumed ? "RETURNED" : "ISSUED", issuedAt: now, issuedById: actor.userId, containerId: container?.id ?? null, dueAt, ...(allConsumed ? { returnedAt: now } : {}) },
  });
  await recordAuditEvent({ client: tx, action: "loan.issued", spaceId: input.spaceId, actorId: actor.userId, targetType: "Loan", targetId: loan.id, metadata: { units, evidenceId: evidence.id, container: container?.code ?? null } });
  await emitEvent(tx, { spaceId: input.spaceId, type: "loan.issued", data: { loanId: loan.id, reference: loanRef(loan.number), units, dueAt: dueAt.toISOString() } });
  await notifyUsers(tx, input.spaceId, [loan.borrowerId], { kind: "loan.issued", title: `${loanRef(loan.number)} is yours until ${formatDayLong(dueAt, loan.space.timezone)}`, body: "Bring everything back to the desk by the due date.", url: loanUrl(loan.space.slug, loan.id, "borrower"), email: true });
  return { dueAt };
}
