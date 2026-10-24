import { describe, expect, it } from "vitest";
import { countLineTotals, countReadiness } from "@/lib/desk/countReadiness";
import { COUNT_QUANTITY_MAX, recordCountSchema } from "@/lib/desk/countSchemas";
import { issueScanOptions } from "@/lib/desk/issueScanOptions";
import { clampReturnChange, issueProgress } from "@/lib/desk/loansProgress";
import { cancelSchema, missingSchema, reasonSchema, sendBackSchema, TRANSFER_NOTE_MAX, TRANSFER_REASON_MAX } from "@/lib/desk/transferSchemas";
import { receiptLabelsMissing, singleShelfAvailability } from "@/lib/desk/transferStock";
import { renewalRefusal } from "@/lib/lending/renewalPolicy";
import { issuePaymentReady, selfCheckoutPaymentReady } from "@/lib/payments/readiness";
import type { FeeOverrides, SpaceFeePolicy } from "@/lib/payments/fees";

describe("return and issue readiness", () => {
  it("clamps all return outcomes together to the latest outstanding quantity", () => {
    const change = { lineId: "line", returned: 4, damaged: 2, lost: 1, locationId: "shelf" };
    expect(clampReturnChange(change, 1)).toEqual({ ...change, returned: 1, damaged: 0, lost: 0 });
    expect(clampReturnChange(change, 0)).toMatchObject({ returned: 0, damaged: 0, lost: 0 });
    expect(clampReturnChange({ ...change, returned: -1, damaged: 1.5 }, 2)).toMatchObject({ returned: 0, damaged: 0, lost: 1 });
  });

  it("requires exactly the approved tags and asks for extra tags to be removed", () => {
    const line = { id: "line", itemId: "drill", name: "Drill", tracking: "SERIALIZED" as const, itemCode: "I", units: 1 };
    const catalog = { assets: { A1: { itemId: "drill" }, A2: { itemId: "drill" }, A3: { itemId: "drill" } }, containerCodes: [] };
    expect(issueProgress([line], ["A1"], catalog).done).toBe(true);
    const extra = issueProgress([line], ["A1", "A2", "A3"], catalog);
    expect(extra).toMatchObject({ done: false, lines: [{ need: 1, have: 3, hint: "Remove 2 extra tags" }] });
    expect(issueProgress([line], ["A1", "A2"], catalog).lines[0]!.hint).toBe("Remove 1 extra tag");
    expect(issueProgress([line], ["A1", "A1"], catalog).done).toBe(true);
  });

  it("excludes reserved assets and containers out on active loans from valid issue scans", () => {
    const asset = { qrCode: "A1", assetTag: "DRILL-1", itemId: "drill", status: "AVAILABLE", item: { name: "Drill" } };
    const container = { qrCode: "C1", code: "BOX-1", name: null, loans: [] };
    const options = issueScanOptions([asset, { ...asset, qrCode: "A2", assetTag: "DRILL-2", status: "RESERVED" }], [container, { ...container, qrCode: "C2", code: "BOX-2", loans: [{ id: "loan" }] }]);
    expect(Object.keys(options.assets)).toEqual(["A1"]);
    expect(options.containers.map((c) => c.code)).toEqual(["C1"]);
    expect(options.unavailable).toEqual({ A2: "DRILL-2", C2: "Container BOX-2" });
  });
});

describe("transfer readiness", () => {
  it("offers the largest single-shelf balance with holds and repair units deducted", () => {
    const available = singleShelfAvailability([
      { itemId: "a", onHand: 5, reserved: 2, quarantined: 1 },
      { itemId: "a", onHand: 6, reserved: 1, quarantined: 1 },
      { itemId: "b", onHand: 3, reserved: 3, quarantined: 0 },
    ]);
    expect([...available]).toEqual([["a", 4], ["b", 0]]);
    expect(singleShelfAvailability([]).size).toBe(0);
  });

  it("needs labels for quantity receipts, including damaged receipts, but not empty lines or asset tags", () => {
    const line = { tracking: "QUANTITY", itemCode: "I1", units: 2 };
    expect(receiptLabelsMissing([line], [])).toBe(true);
    expect(receiptLabelsMissing([line], ["I1"])).toBe(false);
    expect(receiptLabelsMissing([{ ...line, units: 0 }], [])).toBe(false);
    expect(receiptLabelsMissing([{ ...line, tracking: "SERIALIZED" }], [])).toBe(false);
  });

  it("shares the dialog reason and missing-note limits with the action schemas", () => {
    for (const schema of [reasonSchema, cancelSchema]) {
      expect(schema.safeParse({ transferId: "t", reason: "x".repeat(TRANSFER_REASON_MAX) }).success).toBe(true);
      expect(schema.safeParse({ transferId: "t", reason: "x".repeat(TRANSFER_REASON_MAX + 1) }).success).toBe(false);
    }
    const input = { transferId: "t", lines: [], assetIds: [], reason: "x".repeat(TRANSFER_REASON_MAX) };
    expect(sendBackSchema.safeParse(input).success).toBe(true);
    expect(sendBackSchema.safeParse({ ...input, reason: input.reason + "x" }).success).toBe(false);
    expect(missingSchema.safeParse({ transferId: "t", lines: [], note: "x".repeat(TRANSFER_NOTE_MAX) }).success).toBe(true);
    expect(missingSchema.safeParse({ transferId: "t", lines: [], note: "x".repeat(TRANSFER_NOTE_MAX + 1) }).success).toBe(false);
  });
});

describe("renewal readiness", () => {
  const input = { status: "ISSUED" as const, maxRenewals: 2, renewalCount: 0, byBorrower: true, borrowingStatus: "GOOD" as const, openIncidents: 0, waitingRequests: 0 };
  it("checks policy, limits, active state and waiting requests for staff and members", () => {
    expect(renewalRefusal(input)).toBeNull();
    expect(renewalRefusal({ ...input, maxRenewals: 0 })?.reason).toContain("switched off");
    expect(renewalRefusal({ ...input, renewalCount: 2 })?.reason).toContain("used its 2 renewals");
    expect(renewalRefusal({ ...input, status: "RETURNED" })?.reason).toContain("active loan");
    for (const byBorrower of [true, false]) expect(renewalRefusal({ ...input, byBorrower, waitingRequests: 1 })?.reason).toContain("Someone else is waiting");
  });
  it("allows overdue-only restrictions, blocks suspended or incident-restricted members, and preserves staff override", () => {
    expect(renewalRefusal({ ...input, borrowingStatus: "RESTRICTED" })).toBeNull();
    expect(renewalRefusal({ ...input, borrowingStatus: "RESTRICTED", openIncidents: 1 })?.code).toBe("forbidden");
    expect(renewalRefusal({ ...input, borrowingStatus: "SUSPENDED" })?.code).toBe("forbidden");
    expect(renewalRefusal({ ...input, borrowingStatus: null })?.code).toBe("forbidden");
    expect(renewalRefusal({ ...input, borrowingStatus: "SUSPENDED", openIncidents: 1, byBorrower: false })).toBeNull();
  });
});

describe("payment readiness", () => {
  const charge = { kind: "DEPOSIT" as const, status: "DUE" as const, paymentId: "p" };
  it("allows paid, waived, free or pay-later issue, and blocks unconfirmed or failed payments", () => {
    expect(issuePaymentReady(true, [], [])).toBe(true);
    expect(issuePaymentReady(false, [charge], [])).toBe(true);
    expect(issuePaymentReady(true, [charge], [])).toBe(false);
    expect(issuePaymentReady(true, [charge], [{ id: "p", status: "PAID", payLater: false }])).toBe(true);
    expect(issuePaymentReady(true, [charge], [{ id: "promise", status: "PENDING", payLater: true }])).toBe(true);
    for (const status of ["AWAITING_CONFIRMATION", "PENDING", "FAILED", "CANCELLED"] as const) {
      expect(issuePaymentReady(true, [charge], [{ id: "p", status, payLater: false }])).toBe(false);
    }
    expect(issuePaymentReady(true, [{ ...charge, status: "WAIVED" }, { ...charge, kind: "LATE_FEE" }], [])).toBe(true);
  });

  const space: SpaceFeePolicy & { payLaterEnabled: boolean } = { depositMode: "PER_ITEM", depositMinor: 0, rentalMode: "FREE", rentalMinor: 0, lateFeePerDayMinor: 0, lateFeeCapMinor: 0, lateFeeGraceDays: 0, damageChargeMode: "NONE", damageChargeMinor: 0, payLaterEnabled: false };
  const overrides: FeeOverrides = { depositMinor: null, rentalMode: null, rentalMinor: null, lateFeePerDayMinor: null };
  const line = { quantity: 1, item: { ...overrides, consumable: false }, category: null };
  it("uses effective item/category/space fees for self-checkout, including fixed deposits and consumables", () => {
    expect(selfCheckoutPaymentReady(space, [line], 7)).toBe(true);
    expect(selfCheckoutPaymentReady({ ...space, depositMode: "FIXED", depositMinor: 100 }, [line], 7)).toBe(false);
    expect(selfCheckoutPaymentReady(space, [{ ...line, category: { ...overrides, rentalMode: "PER_WEEK", rentalMinor: 100 } }], 7)).toBe(false);
    expect(selfCheckoutPaymentReady(space, [{ ...line, item: { ...line.item, depositMinor: 100 } }], 7)).toBe(false);
    expect(selfCheckoutPaymentReady({ ...space, depositMinor: 100 }, [{ ...line, item: { ...line.item, consumable: true } }], 7)).toBe(true);
    expect(selfCheckoutPaymentReady({ ...space, depositMinor: 100, payLaterEnabled: true }, [line], 7)).toBe(true);
  });
});

describe("count readiness", () => {
  it("allows posting when only uncounted lines are stale and blocks counted stale lines", () => {
    const lines = [{ counted: true, stale: false }, { counted: false, stale: true }];
    const totals = countLineTotals(lines);
    expect(totals).toEqual({ lines: 2, counted: 1, stale: 0 });
    expect(countReadiness({ recordedLines: totals.counted, staleLines: totals.stale, blocked: false }).postReason).toBeNull();
    const staleCounted = countLineTotals([...lines, { counted: true, stale: true }]);
    expect(staleCounted.stale).toBe(1);
    expect(countReadiness({ recordedLines: staleCounted.counted, staleLines: staleCounted.stale, blocked: false }).postReason).toContain("refresh the stale lines");
  });

  it("requires recorded progress to submit and current snapshots and another poster when needed", () => {
    expect(countReadiness({ recordedLines: 0, staleLines: 0, blocked: false }).submitReason).toContain("at least one line");
    expect(countReadiness({ recordedLines: 1, staleLines: 0, blocked: false })).toEqual({ submitReason: null, postReason: null });
    expect(countReadiness({ recordedLines: 1, staleLines: 2, blocked: false }).postReason).toContain("refresh the stale lines");
    expect(countReadiness({ recordedLines: 1, staleLines: 0, blocked: true }).postReason).toContain("another manager");
  });
  it("accepts the schema maximum and refuses the next integer", () => {
    expect(recordCountSchema.shape.counted.safeParse(COUNT_QUANTITY_MAX).success).toBe(true);
    expect(recordCountSchema.shape.counted.safeParse(COUNT_QUANTITY_MAX + 1).success).toBe(false);
  });
});
