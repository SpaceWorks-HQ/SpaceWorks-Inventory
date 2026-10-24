import type { RepairRequestStatus, RepairSeverity, RepairStatus } from "@prisma/client";

/** Repair words (pure and client-safe). */

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const REPAIR_STATUS: Record<RepairStatus, { label: string; tone: Tone }> = {
  REPORTED: { label: "Waiting for a technician", tone: "warning" },
  ASSIGNED: { label: "Being repaired", tone: "info" },
  FIXED: { label: "Fixed, to verify", tone: "info" },
  CLOSED: { label: "Closed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const SEVERITIES: readonly RepairSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const SEVERITY_LABEL: Record<RepairSeverity, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical: unsafe" };

export const REQUEST_STATUS: Record<RepairRequestStatus, { label: string; tone: Tone }> = {
  SENT: { label: "Waiting for an answer", tone: "warning" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  DECLINED: { label: "Declined", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export type PayoutState = "NOTHING_DUE" | "UNPAID" | "PARTLY_PAID" | "PAID";

/** Where the money for a repair stands: nothing approved yet, unpaid, partly paid or paid in full. */
export function payoutState(approvedMinor: number | null, paidMinor: number): PayoutState {
  if (approvedMinor === null) return "NOTHING_DUE";
  if (paidMinor >= approvedMinor) return "PAID";
  return paidMinor > 0 ? "PARTLY_PAID" : "UNPAID";
}

export const PAYOUT_STATE: Record<PayoutState, { label: string; tone: Tone }> = {
  NOTHING_DUE: { label: "Not approved yet", tone: "neutral" },
  UNPAID: { label: "Unpaid", tone: "warning" },
  PARTLY_PAID: { label: "Partly paid", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
};

/** A request still waiting is treated as expired once its time is up (read time; the row is updated when touched). */
export function effectiveRequestStatus(request: { status: RepairRequestStatus; expiresAt: Date }, now = new Date()): RepairRequestStatus {
  return request.status === "SENT" && request.expiresAt <= now ? "EXPIRED" : request.status;
}

export const TIMELINE_WORDS: Record<string, string> = {
  reported: "Reported",
  requested: "Asked",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Request withdrawn",
  assigned: "Assigned",
  unassigned: "Unassigned",
  work: "Work notes updated",
  fixed: "Marked fixed",
  reopened: "Reopened",
  closed: "Verified and closed",
  cancelled: "Cancelled",
  approved: "Amount approved",
  paid: "Payout recorded",
};
