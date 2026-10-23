import type { SpaceRole, TransferStatus } from "@prisma/client";
import { hasRoleAtLeast } from "@/lib/roles";
import { ACTING_SIDE, canTransfer, type TransferAction } from "@/lib/transfers/policy";
import type { TransferDirection, TransferFilter } from "./transferSchemas";

/** Pure transfer-desk rules: which side the viewer's space is, what it may do now, list filters and timeline words. */

export type Side = "source" | "destination" | "both";

export function sideOf(transfer: { sourceSpaceId: string; destSpaceId: string }, spaceId: string): Side | null {
  if (transfer.sourceSpaceId === spaceId && transfer.destSpaceId === spaceId) return "both";
  if (transfer.sourceSpaceId === spaceId) return "source";
  if (transfer.destSpaceId === spaceId) return "destination";
  return null;
}

/** Approve and reject need a manager (canApproveTransfers); every other step is desk staff (canHandleTransfers). */
const MIN_ROLE: Record<TransferAction, SpaceRole> = {
  approve: "MANAGER", reject: "MANAGER", cancel: "STAFF", dispatch: "STAFF", receive: "STAFF", missing: "STAFF", sendBack: "STAFF", receiveReturn: "STAFF",
};

export const ALL_TRANSFER_ACTIONS: readonly TransferAction[] = ["approve", "reject", "cancel", "dispatch", "receive", "missing", "sendBack", "receiveReturn"];

/** The steps this side may take now, given the status and the viewer's role in this space. */
export function allowedTransferActions(status: TransferStatus, side: Side, role: SpaceRole): TransferAction[] {
  return ALL_TRANSFER_ACTIONS.filter((action) => {
    if (!canTransfer(status, action) || !hasRoleAtLeast(role, MIN_ROLE[action])) return false;
    const needed = ACTING_SIDE[action];
    return needed === "either" || side === "both" || needed === side;
  });
}

export const FILTER_STATUSES: Record<TransferFilter, readonly TransferStatus[] | null> = {
  open: ["REQUESTED", "APPROVED", "DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"],
  approval: ["REQUESTED"],
  dispatch: ["APPROVED"],
  transit: ["DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"],
  done: ["RECEIVED", "RETURNED", "REJECTED", "CANCELLED"],
  all: null,
};

export const FILTER_LABEL: Record<TransferFilter, string> = {
  open: "Open", approval: "Needs approval", dispatch: "To dispatch", transit: "In transit", done: "Closed", all: "All",
};

export const DIRECTION_LABEL: Record<TransferDirection, string> = { all: "All", in: "Incoming", out: "Outgoing" };

/** Prisma `where` for one space's transfers in a direction (internal moves count both ways). */
export function directionWhere(spaceId: string, direction: TransferDirection) {
  if (direction === "in") return { destSpaceId: spaceId };
  if (direction === "out") return { sourceSpaceId: spaceId };
  return { OR: [{ sourceSpaceId: spaceId }, { destSpaceId: spaceId }] };
}

const EVENT_WORDS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  dispatched: "Dispatched",
  received: "Received",
  missing_declared: "Declared missing",
  sent_back: "Sent back to the sender",
  return_received: "Return received by the sender",
};

export function transferEventTitle(type: string, metadata: unknown): string {
  const base = EVENT_WORDS[type] ?? "Updated";
  const data = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  if (type === "approved" && data.automatic === true) return "Approved automatically";
  const units = typeof data.units === "number" ? data.units : null;
  if (type === "received" && typeof data.received === "number") {
    const damaged = typeof data.damaged === "number" && data.damaged > 0 ? `, ${data.damaged} damaged` : "";
    return `Received ${data.received}${damaged}`;
  }
  if (type === "missing_declared" && typeof data.missing === "number") return `${data.missing} declared missing`;
  if (units !== null && (type === "dispatched" || type === "sent_back" || type === "return_received" || type === "approved")) return `${base} (${units} ${units === 1 ? "unit" : "units"})`;
  return base;
}
