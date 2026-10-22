import "server-only";

import type { BorrowingStatus } from "@prisma/client";
import type { DbClient } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { emitEvent } from "@/lib/events/emit";
import { createNotifications } from "@/lib/notifications";

type Result = { ok: true } | { ok: false; error: string };

/** A manager sets a member's standing. Manual changes are never lifted automatically. */
export async function setBorrowingStatus(client: DbClient, input: { spaceId: string; membershipId: string; status: BorrowingStatus; note: string | null; memberNumber?: string | null; actorId: string }): Promise<Result> {
  const membership = await client.membership.findFirst({ where: { id: input.membershipId, spaceId: input.spaceId }, select: { id: true, userId: true, borrowingStatus: true, space: { select: { slug: true, name: true } } } });
  if (!membership) return { ok: false, error: "That member wasn't found." };
  if (input.status !== "GOOD" && !input.note) return { ok: false, error: "Add a short reason the member will see." };
  await client.membership.update({
    where: { id: membership.id },
    data: {
      borrowingStatus: input.status,
      borrowingNote: input.status === "GOOD" ? null : input.note,
      borrowingAuto: false,
      ...(input.memberNumber !== undefined ? { memberNumber: input.memberNumber } : {}),
    },
  });
  if (membership.borrowingStatus !== input.status) {
    await recordAuditEvent({ client, action: "member.borrowing_changed", spaceId: input.spaceId, actorId: input.actorId, targetType: "Membership", targetId: membership.id, metadata: { from: membership.borrowingStatus, to: input.status, automatic: false } });
    await emitEvent(client, { spaceId: input.spaceId, type: "member.borrowing_changed", data: { membershipId: membership.id, status: input.status, automatic: false } });
    await createNotifications([{
      userId: membership.userId,
      spaceId: input.spaceId,
      kind: "member.borrowing_changed",
      title: input.status === "GOOD" ? `You can borrow from ${membership.space.name} again` : `Borrowing at ${membership.space.name} is ${input.status === "SUSPENDED" ? "suspended" : "restricted"}`,
      body: input.note,
      url: `/s/${membership.space.slug}/my-loans`,
    }], { client });
  }
  return { ok: true };
}

/**
 * Re-evaluate the automatic restriction for one member after a loan or
 * incident changes: restrict while an incident is open or a loan is overdue
 * (each per space setting), and lift an automatic restriction once neither
 * applies. Manual statuses are left alone.
 */
export async function syncAutomaticRestriction(client: DbClient, input: { spaceId: string; userId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const membership = await client.membership.findUnique({
    where: { userId_spaceId: { userId: input.userId, spaceId: input.spaceId } },
    select: { id: true, borrowingStatus: true, borrowingAuto: true, space: { select: { restrictOnIncident: true, restrictWhenOverdue: true } } },
  });
  if (!membership) return;
  const [incidents, overdue] = await Promise.all([
    membership.space.restrictOnIncident ? client.loanIncident.count({ where: { spaceId: input.spaceId, borrowerId: input.userId, status: "OPEN" } }) : 0,
    membership.space.restrictWhenOverdue ? client.loan.count({ where: { spaceId: input.spaceId, borrowerId: input.userId, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dueAt: { lt: now } } }) : 0,
  ]);
  const shouldRestrict = incidents > 0 || overdue > 0;
  let next: { status: BorrowingStatus; note: string | null; auto: boolean } | null = null;
  if (shouldRestrict && membership.borrowingStatus === "GOOD") {
    next = { status: "RESTRICTED", note: incidents > 0 ? "A lost or damaged item is waiting to be resolved." : "An overdue loan needs to come back first.", auto: true };
  } else if (!shouldRestrict && membership.borrowingStatus === "RESTRICTED" && membership.borrowingAuto) {
    next = { status: "GOOD", note: null, auto: false };
  }
  if (!next) return;
  await client.membership.update({ where: { id: membership.id }, data: { borrowingStatus: next.status, borrowingNote: next.note, borrowingAuto: next.auto } });
  await recordAuditEvent({ client, action: "member.borrowing_changed", spaceId: input.spaceId, actorId: null, targetType: "Membership", targetId: membership.id, metadata: { from: membership.borrowingStatus, to: next.status, automatic: true } });
  await emitEvent(client, { spaceId: input.spaceId, type: "member.borrowing_changed", data: { membershipId: membership.id, status: next.status, automatic: true } });
}

export type EligibilityProblem = { ok: false; code: "lending_off" | "standing" | "email" | "member_number" | "loan_limit" | "item_limit"; error: string };

/**
 * Can this member take `incomingUnits` more on loan right now? Checked when
 * requesting (advisory) and again at every handover (enforced).
 */
export async function checkBorrowingEligibility(client: DbClient, input: { spaceId: string; userId: string; incomingUnits: number; excludeLoanId?: string }): Promise<{ ok: true } | EligibilityProblem> {
  const membership = await client.membership.findUnique({
    where: { userId_spaceId: { userId: input.userId, spaceId: input.spaceId } },
    select: {
      status: true, borrowingStatus: true, borrowingNote: true, memberNumber: true,
      user: { select: { emailVerified: true } },
      space: { select: { lendingEnabled: true, requireVerifiedEmail: true, requireMemberNumber: true, maxActiveLoans: true, maxItemsOnLoan: true } },
    },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, code: "standing", error: "This person isn't an active member of the space." };
  const { space } = membership;
  if (!space.lendingEnabled) return { ok: false, code: "lending_off", error: "Lending is switched off in this space." };
  if (membership.borrowingStatus !== "GOOD") {
    return { ok: false, code: "standing", error: `Borrowing is ${membership.borrowingStatus === "SUSPENDED" ? "suspended" : "restricted"}${membership.borrowingNote ? `: ${membership.borrowingNote}` : "."}` };
  }
  if (space.requireVerifiedEmail && !membership.user.emailVerified) return { ok: false, code: "email", error: "Confirm the member's email address before borrowing." };
  if (space.requireMemberNumber && !membership.memberNumber) return { ok: false, code: "member_number", error: "Staff need to record a membership number before this member can borrow." };
  const active = await client.loan.findMany({
    where: { spaceId: input.spaceId, borrowerId: input.userId, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, ...(input.excludeLoanId ? { NOT: { id: input.excludeLoanId } } : {}) },
    select: { lines: { select: { quantityIssued: true, quantityReturned: true, quantityDamaged: true, quantityLost: true } } },
  });
  if (space.maxActiveLoans > 0 && active.length >= space.maxActiveLoans) {
    return { ok: false, code: "loan_limit", error: `Members can have ${space.maxActiveLoans} active ${space.maxActiveLoans === 1 ? "loan" : "loans"} at a time. Return one first.` };
  }
  const outstanding = active.flatMap((loan) => loan.lines).reduce((sum, line) => sum + line.quantityIssued - line.quantityReturned - line.quantityDamaged - line.quantityLost, 0);
  if (space.maxItemsOnLoan > 0 && outstanding + input.incomingUnits > space.maxItemsOnLoan) {
    return { ok: false, code: "item_limit", error: `Members can hold ${space.maxItemsOnLoan} items at a time; this would make ${outstanding + input.incomingUnits}.` };
  }
  return { ok: true };
}
