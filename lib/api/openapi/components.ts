/** Shared OpenAPI 3.1 components for /api/v1 (hand-written; keep in step with lib/api/dto.ts). */

const str = { type: "string" } as const;
const nstr = { type: ["string", "null"] } as const;
const int = { type: "integer" } as const;
const nint = { type: ["integer", "null"] } as const;
const bool = { type: "boolean" } as const;
const dt = { type: ["string", "null"], format: "date-time" } as const;
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const quantities = obj({ quantityRequested: int, quantityApproved: int });

export const schemas = {
  Error: obj({ error: obj({ code: str, message: str }, ["code", "message"]) }, ["error"]),
  Availability: obj({ onHand: int, reserved: int, quarantined: int, available: int, onLoan: int, inTransit: int }),
  Space: obj({ id: str, slug: str, name: str, tagline: nstr, timezone: str, currency: str, tagPrefix: str, acceptsTransfers: bool, lending: obj({ enabled: bool, publicCatalogue: bool, selfCheckout: bool, defaultLoanDays: int, maxLoanDays: int }) }),
  Item: obj({
    id: str, sku: str, name: str, description: nstr, tracking: { enum: ["QUANTITY", "SERIALIZED"] }, barcode: nstr, brand: nstr, model: nstr, tags: { type: "array", items: str },
    category: { oneOf: [obj({ id: str, name: str }), { type: "null" }] }, unit: { oneOf: [obj({ id: str, name: str, symbol: str }), { type: "null" }] }, supplier: { oneOf: [obj({ id: str, name: str }), { type: "null" }] },
    unitCostMinor: int, avgCostMinor: int, reorderPoint: nint, reorderQuantity: nint,
    lending: obj({ lendable: bool, consumable: bool, selfCheckout: bool, requiresApproval: bool, loanDays: nint, depositMinor: nint, rentalMode: { enum: ["FREE", "PER_DAY", "PER_WEEK", "FLAT", null] }, rentalMinor: nint, lateFeePerDayMinor: nint, replacementMinor: nint }),
    archived: bool, availability: ref("Availability"), createdAt: dt, updatedAt: dt,
  }),
  ItemInput: obj({
    name: str, sku: str, description: str, categoryId: str, unitId: str, supplierId: str, tracking: { enum: ["QUANTITY", "SERIALIZED"] }, barcode: str, brand: str, model: str,
    tags: { type: "array", items: str }, unitCostMinor: int, reorderPoint: nint, reorderQuantity: nint, lendable: bool, consumable: bool, selfCheckout: bool, requiresApproval: bool,
    loanDays: nint, replacementMinor: nint, depositMinor: nint, rentalMode: { enum: ["FREE", "PER_DAY", "PER_WEEK", "FLAT", null] }, rentalMinor: nint, lateFeePerDayMinor: nint, notes: str,
  }, ["name"]),
  Location: obj({ id: str, parentId: nstr, kind: { enum: ["SITE", "BUILDING", "FLOOR", "ROOM", "AREA", "CABINET", "SHELF", "BIN", "OTHER"] }, name: str, code: str, description: nstr, archived: bool }),
  LocationInput: obj({ name: str, code: { type: "string", pattern: "^[A-Z0-9][A-Z0-9._-]{0,23}$" }, kind: str, parentId: str, description: str }, ["name", "code"]),
  StockRow: obj({ itemId: str, sku: str, name: str, tracking: str, unit: nstr, reorderPoint: nint, onHand: int, reserved: int, quarantined: int, available: int, onLoan: int, inTransit: int }),
  Balance: obj({ itemId: str, locationId: str, onHand: int, reserved: int, quarantined: int, available: int }),
  Adjustment: obj({ itemId: str, locationId: str, delta: int, reason: { enum: ["FOUND", "CORRECTION", "CONSUMED", "LOST", "DAMAGED", "EXPIRED", "STOLEN", "DONATED", "RETURNED_TO_SUPPLIER", "OTHER"] }, note: str }, ["itemId", "locationId", "delta", "reason"]),
  Receipt: obj({ itemId: str, locationId: str, quantity: int, unitCostMinor: nint, reason: { enum: ["RECEIVED", "FOUND", "DONATED"] }, note: str }, ["itemId", "locationId", "quantity"]),
  Asset: obj({ id: str, itemId: str, assetTag: str, serialNumber: nstr, status: { enum: ["AVAILABLE", "RESERVED", "ON_LOAN", "IN_TRANSIT", "MAINTENANCE", "LOST", "RETIRED"] }, condition: str, locationId: nstr, purchasedAt: dt, warrantyUntil: dt, createdAt: dt }),
  Loan: obj({
    id: str, reference: str, number: int, status: { enum: ["REQUESTED", "APPROVED", "REJECTED", "CANCELLED", "ISSUED", "PARTIALLY_RETURNED", "RETURNED", "CLOSED_WITH_ISSUE"] }, overdue: bool, selfCheckout: bool,
    borrower: obj({ membershipId: nstr, name: nstr }), dueAt: dt, neededFrom: dt, renewalCount: int, approvedAt: dt, issuedAt: dt, returnedAt: dt, rejectedAt: dt, cancelledAt: dt, createdAt: dt,
    lines: { type: "array", items: { allOf: [quantities, obj({ id: str, itemId: str, assetId: nstr, quantityIssued: int, quantityReturned: int, quantityDamaged: int, quantityLost: int, quantityConsumed: int })] } },
  }),
  LoanRequest: obj({ memberId: str, lines: { type: "array", items: obj({ itemId: str, quantity: int }, ["itemId", "quantity"]) }, purpose: str, neededFrom: { type: "string", format: "date-time" } }, ["memberId", "lines"]),
  Transfer: obj({
    id: str, reference: str, number: int, status: str, direction: { enum: ["in", "out", "internal"] },
    source: obj({ space: str, spaceName: str, locationId: str }), destination: obj({ space: str, spaceName: str, locationId: nstr }),
    neededBy: dt, approvedAt: dt, dispatchedAt: dt, receivedAt: dt, rejectedAt: dt, cancelledAt: dt, createdAt: dt,
    lines: { type: "array", items: { allOf: [quantities, obj({ id: str, item: obj({ id: str, sku: str, name: str }), destItemId: nstr, quantityDispatched: int, quantityReceived: int, quantityDamaged: int, quantityMissing: int, quantityReturning: int, quantityReturned: int })] } },
  }),
  TransferRequest: obj({ destinationSpace: str, sourceLocationId: str, destinationLocationId: str, lines: { type: "array", items: obj({ itemId: str, quantity: int }, ["itemId", "quantity"]) }, reason: str, neededBy: { type: "string", format: "date-time" } }, ["sourceLocationId", "lines"]),
  Approve: obj({ quantities: { type: ["object", "null"], additionalProperties: int, description: "Line id → units to approve. Omit to approve everything requested." } }),
  Reject: obj({ reason: str }, ["reason"]),
  Cancel: obj({ reason: str }),
  Member: obj({ id: str, name: nstr, role: { enum: ["MANAGER", "STAFF", "MEMBER"] }, status: { enum: ["ACTIVE", "SUSPENDED"] }, borrowingStatus: { enum: ["GOOD", "RESTRICTED", "SUSPENDED"] }, joinedAt: dt }),
} as const;

export const parameters = {
  limit: { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 }, description: "Page size." },
  cursor: { name: "cursor", in: "query", schema: str, description: "nextCursor from the previous page." },
  id: { name: "id", in: "path", required: true, schema: str },
} as const;

const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: ref("Error") } } });

export const responses = {
  Unauthorized: errorResponse("Missing, invalid, revoked or expired API key."),
  Forbidden: errorResponse("The key lacks the scope, or the step belongs to the other space."),
  NotFound: errorResponse("Not found in this space."),
  Invalid: errorResponse("The request was refused: bad input or a business rule."),
  Conflict: errorResponse("The record is not in a state that allows this, or stock is short."),
  RateLimited: errorResponse("Too many requests; retry after the Retry-After header."),
} as const;

/** `{ data: T }` */
export function one(schema: string, description = "OK") {
  return { description, content: { "application/json": { schema: obj({ data: ref(schema) }, ["data"]) } } };
}

/** `{ data: T[], nextCursor }` */
export function page(schema: string) {
  return { description: "A page of results", content: { "application/json": { schema: obj({ data: { type: "array", items: ref(schema) }, nextCursor: nstr }, ["data", "nextCursor"]) } } };
}

export function body(schema: string, required = true) {
  return { required, content: { "application/json": { schema: ref(schema) } } };
}

export function errors(...names: (keyof typeof responses)[]) {
  return Object.fromEntries(names.map((name) => [{ Unauthorized: "401", Forbidden: "403", NotFound: "404", Invalid: "400", Conflict: "409", RateLimited: "429" }[name], { $ref: `#/components/responses/${name}` }]));
}

export const query = (name: string, description: string, schema: Record<string, unknown> = str) => ({ name, in: "query", schema, description });
export const pageParams = [{ $ref: "#/components/parameters/limit" }, { $ref: "#/components/parameters/cursor" }];
export const idParam = { $ref: "#/components/parameters/id" };
