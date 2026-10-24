import { describe, expect, it } from "vitest";
import { changeIsValid, issueProgress, returnProgress, type HandoverLine } from "@/lib/desk/loansProgress";
import { approveLoanSchema, requestLoanSchema, returnLoanSchema, selfCheckoutSchema, setDueSchema } from "@/lib/desk/loansSchemas";

const drill: HandoverLine = { id: "l1", itemId: "drill", name: "Drill", tracking: "SERIALIZED", itemCode: "IDRILL", units: 2 };
const screws: HandoverLine = { id: "l2", itemId: "screws", name: "Screws", tracking: "QUANTITY", itemCode: "ISCREWS", units: 10 };
const catalog = { assets: { A1: { itemId: "drill" }, A2: { itemId: "drill" }, A3: { itemId: "saw" } }, containerCodes: ["CBOX"] };

describe("issue progress", () => {
  it("needs one asset tag per serialized unit and the label of each quantity line", () => {
    const start = issueProgress([drill, screws], [], catalog);
    expect(start.done).toBe(false);
    expect(start.lines.map((l) => [l.need, l.have])).toEqual([[2, 0], [1, 0]]);
    const half = issueProgress([drill, screws], ["A1", "A3", "ISCREWS"], catalog);
    expect(half.lines[0]).toMatchObject({ have: 1, hint: "Scan 1 more asset tag" });
    expect(half.done).toBe(false);
    expect(issueProgress([drill, screws], ["A1", "A2", "ISCREWS"], catalog).done).toBe(true);
  });

  it("accepts the container instead of item labels and skips lines with nothing approved", () => {
    const result = issueProgress([screws, { ...drill, units: 0 }], ["CBOX"], catalog);
    expect(result).toMatchObject({ containerScanned: true, done: true });
    expect(result.lines).toHaveLength(1);
  });
});

describe("return progress", () => {
  const tagged: HandoverLine = { ...drill, units: 1, assetCode: "A1" };
  it("asks for the asset tag of returned or damaged units, never of lost ones", () => {
    expect(returnProgress([tagged], [{ lineId: "l1", returned: 0, damaged: 0, lost: 1 }], [], null)).toMatchObject({ lines: [], done: true });
    expect(returnProgress([tagged], [{ lineId: "l1", returned: 0, damaged: 1, lost: 0 }], [], null).done).toBe(false);
    expect(returnProgress([tagged], [{ lineId: "l1", returned: 1, damaged: 0, lost: 0 }], ["A1"], null).done).toBe(true);
  });

  it("needs the loan's container when anything physical comes back", () => {
    const changes = [{ lineId: "l2", returned: 4, damaged: 0, lost: 0 }];
    const without = returnProgress([screws], changes, [], "CBOX");
    expect(without).toMatchObject({ containerNeeded: true, containerScanned: false, done: false });
    expect(returnProgress([screws], changes, ["CBOX"], "CBOX").done).toBe(true);
    expect(returnProgress([screws], [{ lineId: "l2", returned: 0, damaged: 0, lost: 2 }], [], "CBOX").containerNeeded).toBe(false);
  });

  it("checks a change against what is still out", () => {
    expect(changeIsValid({ lineId: "x", returned: 2, damaged: 1, lost: 0 }, 3)).toBe(true);
    expect(changeIsValid({ lineId: "x", returned: 2, damaged: 2, lost: 0 }, 3)).toBe(false);
    expect(changeIsValid({ lineId: "x", returned: -1, damaged: 0, lost: 0 }, 3)).toBe(false);
  });
});

describe("loan schemas", () => {
  it("requires return remarks and at least one line", () => {
    expect(returnLoanSchema.safeParse({ loanId: "loan1", scannedCodes: [], remarks: " ", lines: [{ lineId: "a", returned: 1, damaged: 0, lost: 0 }] }).success).toBe(false);
    expect(returnLoanSchema.safeParse({ loanId: "loan1", scannedCodes: [], remarks: "Fine", lines: [] }).success).toBe(false);
    expect(returnLoanSchema.safeParse({ loanId: "loan1", scannedCodes: ["A1"], remarks: "Fine", lines: [{ lineId: "a", returned: 1, damaged: 0, lost: 0 }] }).success).toBe(true);
  });

  it("refuses fractional or negative approvals and odd due dates", () => {
    expect(approveLoanSchema.safeParse({ loanId: "loan1", quantities: { a: 1.5 } }).success).toBe(false);
    expect(approveLoanSchema.safeParse({ loanId: "loan1", quantities: { a: -1 } }).success).toBe(false);
    expect(setDueSchema.safeParse({ loanId: "loan1", dueDate: "24/10/2026" }).success).toBe(false);
    expect(setDueSchema.safeParse({ loanId: "loan1", dueDate: "2026-10-24" }).success).toBe(true);
  });

  it("limits requests to 20 items of 1 to 99 units and self-checkout to scanned labels", () => {
    const line = (n: number) => ({ itemId: `item${n}`, quantity: 1 });
    expect(requestLoanSchema.safeParse({ lines: Array.from({ length: 21 }, (_, i) => line(i)) }).success).toBe(false);
    expect(requestLoanSchema.safeParse({ lines: [{ itemId: "a", quantity: 100 }] }).success).toBe(false);
    expect(requestLoanSchema.parse({ lines: [line(1)] })).toMatchObject({ purpose: "", neededFrom: "" });
    expect(selfCheckoutSchema.safeParse({ scannedCodes: [] }).success).toBe(false);
  });
});
