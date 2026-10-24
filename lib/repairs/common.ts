import "server-only";

import type { RepairIssue } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { DomainError } from "@/lib/domainError";

/** Who acts on a repair: a signed-in member, or an external technician through their link. */
export type RepairActor = { userId: string | null; technicianId?: string | null };

export const OPEN_STATUSES = ["REPORTED", "ASSIGNED", "FIXED"] as const;

/**
 * Lock a repair (first in the lock order, like a loan or transfer row) and
 * read it. Unknown ids and other spaces' repairs are the same not-found.
 */
export async function lockIssue(tx: Tx, spaceId: string, issueId: string): Promise<RepairIssue> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "RepairIssue" WHERE "id" = ${issueId} AND "spaceId" = ${spaceId} FOR UPDATE`;
  if (!row) throw new DomainError("That repair wasn't found.", "not_found");
  return tx.repairIssue.findUniqueOrThrow({ where: { id: issueId } });
}

export type TimelineKind =
  | "reported" | "requested" | "accepted" | "declined" | "withdrawn" | "assigned" | "unassigned"
  | "work" | "fixed" | "reopened" | "closed" | "cancelled" | "approved" | "paid";

/** One line on the repair's append-only timeline. Never put amounts or contact details in `text`. */
export function addTimeline(tx: Tx, input: { spaceId: string; issueId: string; kind: TimelineKind; actor: RepairActor; technicianId?: string | null; channel?: string | null; text?: string | null }) {
  return tx.repairEvent.create({
    data: {
      spaceId: input.spaceId,
      issueId: input.issueId,
      kind: input.kind,
      actorId: input.actor.userId,
      technicianId: input.technicianId ?? input.actor.technicianId ?? null,
      channel: input.channel ?? null,
      text: input.text?.trim().slice(0, 1000) || null,
    },
  });
}

/** Active inventory managers of the space (they run repairs and are told about them). */
export async function managerIds(tx: Tx, spaceId: string) {
  const rows = await tx.membership.findMany({ where: { spaceId, status: "ACTIVE", role: "MANAGER" }, select: { userId: true } });
  return rows.map((row) => row.userId);
}

export function repairPath(slug: string, issueId: string) {
  return `/s/${slug}/repairs/${issueId}`;
}
