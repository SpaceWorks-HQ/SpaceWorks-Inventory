import type { Space } from "@prisma/client";
import { loanRef } from "@/lib/catalogue/references";
import { formatDayLong } from "@/lib/format/datetime";
import { isOverdue } from "@/lib/lending/policy";
import { renewalRefusal, type RenewalFacts } from "@/lib/lending/renewalPolicy";
import type { LoanDetail } from "./loansDetail";
import { incidentViews, loanFacts } from "./loansView";

type Policy = Pick<Space, "timezone" | "maxRenewals" | "renewalDays" | "selfCheckoutEnabled">;
const NEXT_STEP: Record<string, string> = {
  REQUESTED: "Waiting for the desk to approve it. You'll get a notification.",
  APPROVED: "Ready to collect. Come to the desk; staff scan and photograph the items as they hand them over.",
  ISSUED: "Bring everything back to the desk by the due date.",
  PARTIALLY_RETURNED: "Some items are back. Bring the rest to the desk by the due date.",
};

/** Explicit borrower allowlist. Desk notes, locations and borrowing standing stay on the server. */
export function memberLoanView(loan: LoanDetail, policy: Policy, now: Date, renewal: RenewalFacts) {
  const active = loan.status === "ISSUED" || loan.status === "PARTIALLY_RETURNED";
  const overdue = isOverdue(loan, now);
  const renewalsLeft = Math.max(0, policy.maxRenewals - loan.renewalCount);
  const refusal = renewalRefusal({ ...renewal, status: loan.status, renewalCount: loan.renewalCount, maxRenewals: policy.maxRenewals, byBorrower: true });
  const selfReturn = active && loan.selfCheckout && policy.selfCheckoutEnabled;
  return {
    id: loan.id,
    reference: loanRef(loan.number),
    status: loan.status,
    overdue,
    facts: loanFacts(loan, policy.timezone, now, { showBorrower: false }),
    lines: loan.lines.map((line) => ({
      id: line.id, name: line.itemName, sku: line.sku, assetTag: line.assetTag,
      requested: line.requested, approved: line.approved, issued: line.issued,
      returned: line.returned, damaged: line.damaged, lost: line.lost,
      consumed: line.consumed, outstanding: line.outstanding,
    })),
    incidents: incidentViews(loan, policy.timezone).map((incident) => ({
      id: incident.id, kind: incident.kind, quantity: incident.quantity, description: incident.description,
      open: incident.open, label: incident.label, resolutionLabel: incident.resolutionLabel,
      resolutionNote: incident.resolutionNote, whenLabel: incident.whenLabel,
    })),
    canRenew: !refusal,
    renewReason: active ? refusal?.reason ?? null : null,
    renewHint: `Adds ${policy.renewalDays} days if nobody is waiting for these items. ${renewalsLeft} ${renewalsLeft === 1 ? "renewal" : "renewals"} left.`,
    canCancel: loan.status === "REQUESTED" || loan.status === "APPROVED",
    selfReturn,
    returnLines: selfReturn ? loan.lines.filter((line) => line.outstanding > 0).map((line) => ({
      id: line.id, itemId: line.itemId, name: line.itemName, tracking: line.tracking,
      itemCode: line.itemCode, units: line.outstanding, assetCode: line.assetCode,
      label: line.assetTag ? `${line.itemName} · ${line.assetTag}` : line.itemName,
    })) : [],
    nextStep: overdue ? `This loan was due ${formatDayLong(loan.dueAt, policy.timezone, now)}. Please bring it back as soon as you can.` : NEXT_STEP[loan.status] ?? null,
    closedNote: loan.status === "REJECTED" ? loan.rejectReason : null,
  };
}
