/**
 * Outbound event catalogue (pure and client-safe, so the webhook form can
 * list it). Payloads carry ids, numbers, quantities and statuses only:
 * never emails, phone numbers, remarks, evidence photos or secrets.
 */
export const EVENT_TYPES = [
  { type: "item.created", label: "Item created" },
  { type: "item.updated", label: "Item updated" },
  { type: "stock.adjusted", label: "Stock adjusted or received" },
  { type: "stock.low", label: "Stock fell to its reorder point" },
  { type: "count.posted", label: "Cycle count posted" },
  { type: "loan.requested", label: "Loan requested" },
  { type: "loan.approved", label: "Loan approved" },
  { type: "loan.rejected", label: "Loan rejected" },
  { type: "loan.cancelled", label: "Loan cancelled" },
  { type: "loan.issued", label: "Loan issued" },
  { type: "loan.returned", label: "Loan returned (fully or partly)" },
  { type: "loan.renewed", label: "Loan renewed" },
  { type: "loan.overdue", label: "Loan overdue" },
  { type: "incident.opened", label: "Item lost or damaged" },
  { type: "incident.resolved", label: "Lost or damaged item resolved" },
  { type: "member.borrowing_changed", label: "Member borrowing status changed" },
  { type: "payment.succeeded", label: "Payment received" },
  { type: "payment.refunded", label: "Refund processed" },
  { type: "transfer.requested", label: "Transfer requested" },
  { type: "transfer.approved", label: "Transfer approved" },
  { type: "transfer.rejected", label: "Transfer rejected" },
  { type: "transfer.dispatched", label: "Transfer dispatched" },
  { type: "transfer.received", label: "Transfer received (fully or partly)" },
  { type: "transfer.cancelled", label: "Transfer cancelled" },
  { type: "transfer.returned", label: "Transfer returned to sender" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["type"];

export const EVENT_TYPE_VALUES: readonly EventType[] = EVENT_TYPES.map((entry) => entry.type);

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPE_VALUES as readonly string[]).includes(value);
}

/** Scalar facts only, so nothing personal or secret can ride along. */
export type EventData = Record<string, string | number | boolean | null | Array<Record<string, string | number | boolean | null>>>;

/** Does an endpoint subscribed to `events` want `type`? "*" means everything. */
export function endpointWants(events: readonly string[], type: EventType): boolean {
  return events.includes("*") || events.includes(type);
}
