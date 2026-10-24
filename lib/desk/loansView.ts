import { formatDayShort, formatRelativeDay } from "@/lib/format/datetime";
import { RESOLUTION_LABEL } from "./loansSchemas";
import type { LoanDetail } from "./loansDetail";

/** Shape a loan for its pages (plain, serialisable values; dates already in words). */

export function lineRows(loan: Pick<LoanDetail, "lines">) {
  return loan.lines.map((line) => ({
    id: line.id,
    name: line.itemName,
    sku: line.sku,
    assetTag: line.assetTag,
    location: line.locationLabel,
    requested: line.requested,
    approved: line.approved,
    issued: line.issued,
    returned: line.returned,
    damaged: line.damaged,
    lost: line.lost,
    consumed: line.consumed,
    outstanding: line.outstanding,
  }));
}

export function incidentViews(loan: Pick<LoanDetail, "incidents">, timeZone: string) {
  return loan.incidents.map((incident) => ({
    id: incident.id,
    kind: incident.kind,
    quantity: incident.quantity,
    description: incident.description,
    open: incident.status === "OPEN",
    label: incident.assetTag ? `${incident.itemName} · ${incident.assetTag}` : incident.itemName,
    resolutionLabel: incident.resolution ? RESOLUTION_LABEL[incident.resolution] : null,
    resolutionNote: incident.resolutionNote,
    whenLabel: incident.resolvedAt ? `Opened ${formatDayShort(incident.createdAt, timeZone)}, resolved ${formatDayShort(incident.resolvedAt, timeZone)}` : `Opened ${formatDayShort(incident.createdAt, timeZone)}`,
    lineLocationId: incident.lineLocationId,
  }));
}

const ACTIVE = new Set(["ISSUED", "PARTIALLY_RETURNED"]);

/** The details card and a one-line summary ("Due Fri 24 Oct", "Returned 3 Oct"). */
export function loanFacts(loan: LoanDetail, timeZone: string, now: Date, options: { showBorrower: boolean }) {
  const due = `${formatDayShort(loan.dueAt, timeZone, now)} (${formatRelativeDay(loan.dueAt, timeZone, now)})`;
  const facts: Array<{ label: string; value: string }> = [];
  if (loan.status === "REQUESTED" || loan.status === "APPROVED" || ACTIVE.has(loan.status)) facts.push({ label: "Due back", value: due });
  facts.push({ label: "Requested", value: formatDayShort(loan.createdAt, timeZone, now) });
  if (loan.neededFrom) facts.push({ label: "Needed from", value: formatDayShort(loan.neededFrom, timeZone, now) });
  if (loan.issuedAt) facts.push({ label: "Handed over", value: formatDayShort(loan.issuedAt, timeZone, now) });
  if (loan.returnedAt) facts.push({ label: "Back", value: formatDayShort(loan.returnedAt, timeZone, now) });
  if (loan.renewalCount) facts.push({ label: "Renewals", value: String(loan.renewalCount) });
  if (loan.container) facts.push({ label: "Container", value: loan.container.name ? `${loan.container.code} · ${loan.container.name}` : loan.container.code });
  if (loan.selfCheckout) facts.push({ label: "Checkout", value: "Self-checkout" });
  if (loan.purpose) facts.push({ label: "Purpose", value: loan.purpose });
  const summary = ACTIVE.has(loan.status) || loan.status === "APPROVED" || loan.status === "REQUESTED"
    ? `Due ${formatDayShort(loan.dueAt, timeZone, now)}`
    : loan.returnedAt ? `Back ${formatDayShort(loan.returnedAt, timeZone, now)}` : `Requested ${formatDayShort(loan.createdAt, timeZone, now)}`;
  return {
    summary,
    view: {
      borrower: options.showBorrower ? { name: loan.borrower.name, email: loan.borrower.email } : null,
      standing: options.showBorrower ? loan.standing : null,
      facts,
    },
  };
}
