import { describe, expect, it } from "vitest";
import type { LoanDetail } from "@/lib/desk/loansDetail";
import { memberLoanView } from "@/lib/desk/memberLoanView";

const now = new Date("2030-01-01T12:00:00Z");
const policy = { timezone: "UTC", maxRenewals: 2, renewalDays: 7, selfCheckoutEnabled: true };
const renewal = { borrowingStatus: "RESTRICTED" as const, openIncidents: 0, waitingRequests: 0 };
const loan: LoanDetail = {
  id: "loan1234", number: 12, status: "ISSUED", dueAt: new Date("2030-01-05"), createdAt: now,
  approvedAt: now, issuedAt: now, returnedAt: null, neededFrom: null, purpose: "Workshop",
  selfCheckout: true, renewalCount: 1, rejectReason: null, staffNote: "PRIVATE_STAFF_NOTE",
  borrower: { id: "borrower123", name: "Member", email: "private@example.test" },
  standing: { status: "RESTRICTED", note: "PRIVATE_STANDING", memberNumber: "PRIVATE_MEMBER_NUMBER" },
  container: { code: "BOX-1", name: "Toolbox", qrCode: "PRIVATE_CONTAINER_QR" },
  lines: [{
    id: "line1", itemId: "item1", itemName: "Drill", sku: "DRILL", tracking: "SERIALIZED",
    itemCode: "ITEM_QR", consumable: false, unitSymbol: null, assetTag: "DRILL-1", assetCode: "ASSET_QR",
    locationId: "PRIVATE_LOCATION_ID", locationLabel: "PRIVATE_SHELF_LABEL",
    requested: 1, approved: 1, issued: 1, returned: 0, damaged: 0, lost: 0, consumed: 0, outstanding: 1,
  }],
  incidents: [{
    id: "incident1", kind: "DAMAGED", quantity: 1, description: "Bent tip", status: "RESOLVED",
    resolution: "REPAIRED", resolutionNote: "Tip replaced", createdAt: now, resolvedAt: now,
    itemName: "Drill", assetTag: "DRILL-1", lineLocationId: "PRIVATE_INCIDENT_LOCATION",
  }],
};

describe("borrower loan DTO", () => {
  it("preserves rendered facts, lines, incidents and self-return labels", () => {
    const view = memberLoanView(loan, policy, now, renewal);
    expect(view).toMatchObject({ id: loan.id, reference: "LN-0012", status: "ISSUED", canRenew: true, canCancel: false, selfReturn: true });
    expect(view.lines[0]).toEqual({ id: "line1", name: "Drill", sku: "DRILL", assetTag: "DRILL-1", requested: 1, approved: 1, issued: 1, returned: 0, damaged: 0, lost: 0, consumed: 0, outstanding: 1 });
    expect(view.incidents[0]).toMatchObject({ description: "Bent tip", resolutionNote: "Tip replaced", open: false });
    expect(view.returnLines[0]).toMatchObject({ id: "line1", assetCode: "ASSET_QR", units: 1 });
    expect(view.facts.view.facts).toContainEqual({ label: "Container", value: "BOX-1 · Toolbox" });
  });

  it("omits desk-only data at every level", () => {
    const view = memberLoanView(loan, policy, now, renewal);
    const json = JSON.stringify(view);
    expect(json).not.toContain("PRIVATE_");
    expect(json).not.toContain("private@example.test");
    expect(view).not.toHaveProperty("staffNote");
    expect(view.lines[0]).not.toHaveProperty("location");
    expect(view.lines[0]).not.toHaveProperty("locationId");
    expect(view.incidents[0]).not.toHaveProperty("lineLocationId");
    expect(view.facts.view).toMatchObject({ borrower: null, standing: null });
  });

  it("only includes self-return codes when self-return is offered", () => {
    expect(memberLoanView({ ...loan, selfCheckout: false }, policy, now, renewal).returnLines).toEqual([]);
    const closed = memberLoanView({ ...loan, status: "REJECTED", rejectReason: "Needed for class" }, policy, now, renewal);
    expect(closed).toMatchObject({ canRenew: false, canCancel: false, selfReturn: false, closedNote: "Needed for class", nextStep: null, returnLines: [] });
  });

  it("replaces renewal with its refusal reason without exposing policy facts", () => {
    const view = memberLoanView(loan, policy, now, { ...renewal, waitingRequests: 1 });
    expect(view.canRenew).toBe(false);
    expect(view.renewReason).toContain("Someone else is waiting");
    expect(view).not.toHaveProperty("waitingRequests");
    expect(memberLoanView(loan, policy, now, { ...renewal, borrowingStatus: "SUSPENDED" }).renewReason).toContain("restricted");
  });
});
