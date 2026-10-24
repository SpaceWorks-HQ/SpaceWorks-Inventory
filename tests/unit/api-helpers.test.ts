import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { DomainError } from "@/lib/domainError";
import { StockError } from "@/lib/inventory/availability/errors";
import { ApiInputError, failureFor } from "@/lib/api/errors";
import { DEFAULT_LIMIT, MAX_LIMIT, afterCursor, booleanParam, enumParam, pageOf, parsePage } from "@/lib/api/pagination";
import { mergeItemPatch, type StoredItem } from "@/lib/api/items";
import { itemSchema } from "@/lib/catalogue/schemas";
import { adjustmentSchema, loanRequestSchema, transferRequestSchema } from "@/lib/api/schemas";

const params = (query: string) => new URLSearchParams(query);

describe("pagination", () => {
  it("defaults and bounds the limit", () => {
    expect(parsePage(params(""))).toEqual({ limit: DEFAULT_LIMIT, cursor: null });
    expect(parsePage(params("limit=100&cursor=abc_123"))).toEqual({ limit: MAX_LIMIT, cursor: "abc_123" });
    for (const bad of ["limit=0", "limit=101", "limit=ten", "limit=-1"]) expect(() => parsePage(params(bad))).toThrow(ApiInputError);
    expect(() => parsePage(params("cursor=a%20b"))).toThrow(/cursor/);
  });

  it("returns a next cursor only when there is another page", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(pageOf(rows, 2)).toEqual({ rows: [{ id: "a" }, { id: "b" }], nextCursor: "b" });
    expect(pageOf(rows, 3)).toEqual({ rows, nextCursor: null });
    expect(afterCursor({ limit: 2, cursor: "b" })).toEqual({ id: { gt: "b" } });
    expect(afterCursor({ limit: 2, cursor: null })).toEqual({});
  });

  it("parses boolean and enum filters strictly", () => {
    expect(booleanParam(params("lendable=true"), "lendable")).toBe(true);
    expect(booleanParam(params("lendable=0"), "lendable")).toBe(false);
    expect(booleanParam(params(""), "lendable")).toBeUndefined();
    expect(() => booleanParam(params("lendable=yes"), "lendable")).toThrow(ApiInputError);
    expect(enumParam(params("status=issued"), "status", ["ISSUED", "RETURNED"] as const)).toBe("ISSUED");
    expect(() => enumParam(params("status=gone"), "status", ["ISSUED"] as const)).toThrow(/ISSUED/);
  });
});

describe("error mapping", () => {
  it("maps domain, stock, validation and input errors to envelopes", () => {
    expect(failureFor(new DomainError("That item wasn't found.", "not_found"))).toEqual({ status: 404, code: "NOT_FOUND", message: "That item wasn't found." });
    expect(failureFor(new DomainError("No.", "forbidden"))?.status).toBe(403);
    expect(failureFor(new DomainError("Busy.", "conflict"))?.status).toBe(409);
    expect(failureFor(new StockError("Only 2 free at this location."))).toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK" });
    expect(failureFor(new StockError("Bad.", "invalid_quantity"))?.status).toBe(400);
    expect(failureFor(new ApiInputError("Send a body."))).toEqual({ status: 400, code: "INVALID", message: "Send a body." });
    const zod = z.object({ name: z.string().min(1, "Enter a name.") }).safeParse({ name: "" });
    expect(zod.success).toBe(false);
    expect(failureFor((zod as { error: ZodError }).error)).toEqual({ status: 400, code: "INVALID", message: "name: Enter a name." });
  });

  it("leaves unexpected errors unmapped", () => {
    expect(failureFor(new Error("database down"))).toBeNull();
  });
});

const stored: StoredItem = {
  name: "Drill", sku: "DRILL", description: null, categoryId: "cat1", unitId: null, supplierId: null, tracking: "QUANTITY", barcode: null, brand: "Bosch", model: null, tags: ["power"],
  unitCostMinor: 1000, reorderPoint: 2, reorderQuantity: null, lendable: true, consumable: false, selfCheckout: false, requiresApproval: true, loanDays: null,
  replacementMinor: null, depositMinor: 500, rentalMode: null, rentalMinor: null, lateFeePerDayMinor: null, notes: null,
};

describe("item patch", () => {
  it("keeps untouched fields and validates as a whole item", () => {
    const merged = itemSchema.parse(mergeItemPatch(stored, { name: "Cordless drill", reorderPoint: 5 }));
    expect(merged).toMatchObject({ name: "Cordless drill", sku: "DRILL", reorderPoint: 5, brand: "Bosch", categoryId: "cat1", depositMinor: 500, tags: ["power"] });
  });

  it("clears text fields with null", () => {
    const merged = itemSchema.parse(mergeItemPatch(stored, { brand: null, categoryId: null, depositMinor: null }));
    expect(merged).toMatchObject({ brand: null, categoryId: null, depositMinor: null });
  });

  it("refuses unknown, read-only and empty patches", () => {
    expect(() => mergeItemPatch(stored, { qrCode: "X" })).toThrow(/qrCode/);
    expect(() => mergeItemPatch(stored, { avgCostMinor: 1 })).toThrow(/read-only/);
    expect(() => mergeItemPatch(stored, {})).toThrow(/at least one/);
    expect(() => mergeItemPatch(stored, [])).toThrow(ApiInputError);
  });
});

describe("request bodies", () => {
  it("refuses zero adjustments and unknown fields", () => {
    expect(adjustmentSchema.safeParse({ itemId: "i1", locationId: "l1", delta: 0, reason: "CORRECTION" }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ itemId: "i1", locationId: "l1", delta: -2, reason: "LOST", extra: 1 }).success).toBe(false);
    expect(adjustmentSchema.parse({ itemId: "i1", locationId: "l1", delta: -2, reason: "LOST" })).toMatchObject({ delta: -2, note: null });
  });

  it("parses loan and transfer requests with dates", () => {
    const loan = loanRequestSchema.parse({ memberId: "m1", lines: [{ itemId: "i1", quantity: 1 }], neededFrom: "2026-10-30T09:00:00+05:30" });
    expect(loan.neededFrom).toBeInstanceOf(Date);
    expect(loanRequestSchema.safeParse({ memberId: "m1", lines: [] }).success).toBe(false);
    const transfer = transferRequestSchema.parse({ sourceLocationId: "l1", destinationLocationId: "l2", lines: [{ itemId: "i1", quantity: 3 }] });
    expect(transfer).toMatchObject({ destinationSpace: null, reason: null, neededBy: null });
  });
});
