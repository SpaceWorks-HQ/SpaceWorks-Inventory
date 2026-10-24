import type { TransferStatus } from "@prisma/client";

/**
 * Pure transfer rules (client-safe, unit tested). lib/transfers/workflow is
 * the only code that applies them.
 *
 * request → approve/reject → dispatch (pick list, QR scan) → in transit →
 * receive (fully or partly, good or damaged) → done; units still in transit
 * can be declared missing or sent back to the sender, who receives them.
 */

export type LineCounts = {
  quantityDispatched: number;
  quantityReceived: number;
  quantityDamaged: number;
  quantityMissing: number;
  quantityReturning: number;
  quantityReturned: number;
};

/** Units that left the source and have not been received, declared missing or sent back. */
export function inTransit(line: LineCounts) {
  return line.quantityDispatched - line.quantityReceived - line.quantityDamaged - line.quantityMissing - line.quantityReturning;
}

/** Units on their way back to the source. */
export function returningOut(line: LineCounts) {
  return line.quantityReturning - line.quantityReturned;
}

/** Status once a transfer has been dispatched, derived from its lines. */
export function statusAfterDispatch(lines: LineCounts[]): TransferStatus {
  const forward = lines.reduce((sum, line) => sum + inTransit(line), 0);
  const back = lines.reduce((sum, line) => sum + returningOut(line), 0);
  const arrived = lines.reduce((sum, line) => sum + line.quantityReceived + line.quantityDamaged, 0);
  const settled = lines.reduce((sum, line) => sum + line.quantityReceived + line.quantityDamaged + line.quantityMissing + line.quantityReturned, 0);
  if (forward === 0 && back === 0) return arrived === 0 ? "RETURNED" : "RECEIVED";
  if (back > 0) return "RETURNING";
  return settled > 0 ? "PARTIALLY_RECEIVED" : "DISPATCHED";
}

export type TransferAction = "approve" | "reject" | "cancel" | "dispatch" | "receive" | "missing" | "sendBack" | "receiveReturn";

const FROM: Record<TransferAction, readonly TransferStatus[]> = {
  approve: ["REQUESTED"],
  reject: ["REQUESTED"],
  cancel: ["REQUESTED", "APPROVED"],
  dispatch: ["APPROVED"],
  receive: ["DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"],
  missing: ["DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"],
  sendBack: ["DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"],
  receiveReturn: ["RETURNING"],
};

export function canTransfer(status: TransferStatus, action: TransferAction) {
  return FROM[action].includes(status);
}

/** Which side acts: the source space approves, picks and dispatches; the destination receives. */
export const ACTING_SIDE: Record<TransferAction, "source" | "destination" | "either"> = {
  approve: "source",
  reject: "source",
  cancel: "either",
  dispatch: "source",
  receive: "destination",
  missing: "either",
  sendBack: "destination",
  receiveReturn: "source",
};

export const TRANSFER_STATUS_LABEL: Record<TransferStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved, to pick",
  REJECTED: "Rejected",
  DISPATCHED: "In transit",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
  RETURNING: "Returning to sender",
  RETURNED: "Returned to sender",
};

export const OPEN_TRANSFER_STATUSES: readonly TransferStatus[] = ["REQUESTED", "APPROVED", "DISPATCHED", "PARTIALLY_RECEIVED", "RETURNING"];
