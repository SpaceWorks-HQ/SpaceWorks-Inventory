import { body, errors, idParam, one, page, pageParams, query } from "./components";

/** Loans, transfers, members and reports. */
const scope = (name: string) => ({ security: [{ apiKey: [name] }] });

const actionParam = (actions: string[]) => ({ name: "action", in: "path", required: true, schema: { enum: actions } });

const plainJson = (description: string) => ({ description, content: { "application/json": { schema: { type: "object", properties: { data: {} } } } } });

export const workflowPaths = {
  "/loans": {
    get: {
      summary: "List loans",
      tags: ["Loans"],
      ...scope("read:loans"),
      parameters: [...pageParams, query("status", "REQUESTED, APPROVED, ISSUED, RETURNED…"), query("member", "Membership id."), query("overdue", "Only overdue loans.", { type: "boolean" })],
      responses: { 200: page("Loan"), ...errors("Invalid", "Unauthorized", "Forbidden") },
    },
    post: {
      summary: "Request a loan for a member",
      description: "Eligibility (standing, limits) is checked now and again at handover. Items that skip approval are approved at once. Issue and return happen at the desk with QR scans and photos.",
      tags: ["Loans"],
      ...scope("write:loans"),
      requestBody: body("LoanRequest"),
      responses: { 201: one("Loan", "Requested"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/loans/{id}": {
    get: { summary: "One loan", tags: ["Loans"], ...scope("read:loans"), parameters: [idParam], responses: { 200: one("Loan"), ...errors("Unauthorized", "Forbidden", "NotFound") } },
  },
  "/loans/{id}/{action}": {
    post: {
      summary: "Approve, reject or cancel a loan request",
      description: "approve: `{ quantities? }` holds the stock; reject: `{ reason }`; cancel: `{ reason? }` before handover.",
      tags: ["Loans"],
      ...scope("write:loans"),
      parameters: [idParam, actionParam(["approve", "reject", "cancel"])],
      requestBody: { required: false, content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/Approve" }, { $ref: "#/components/schemas/Reject" }, { $ref: "#/components/schemas/Cancel" }] } } } },
      responses: { 200: one("Loan"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/transfers": {
    get: {
      summary: "List transfers this space sends or receives",
      tags: ["Transfers"],
      ...scope("read:transfers"),
      parameters: [...pageParams, query("status", "REQUESTED, APPROVED, DISPATCHED…"), query("direction", "in, out or internal.")],
      responses: { 200: page("Transfer"), ...errors("Invalid", "Unauthorized", "Forbidden") },
    },
    post: {
      summary: "Request a transfer",
      description: "Between this space's locations (destinationLocationId required), or pushed to another space (destinationSpace slug). Dispatch and receipt happen in the app with QR scans and photos.",
      tags: ["Transfers"],
      ...scope("write:transfers"),
      requestBody: body("TransferRequest"),
      responses: { 201: one("Transfer", "Requested"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/transfers/{id}": {
    get: { summary: "One transfer", tags: ["Transfers"], ...scope("read:transfers"), parameters: [idParam], responses: { 200: one("Transfer"), ...errors("Unauthorized", "Forbidden", "NotFound") } },
  },
  "/transfers/{id}/{action}": {
    post: {
      summary: "Approve, reject or cancel a transfer",
      description: "The sending space approves (holding the stock) or rejects; either side may cancel before dispatch.",
      tags: ["Transfers"],
      ...scope("write:transfers"),
      parameters: [idParam, actionParam(["approve", "reject", "cancel"])],
      requestBody: { required: false, content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/Approve" }, { $ref: "#/components/schemas/Reject" }, { $ref: "#/components/schemas/Cancel" }] } } } },
      responses: { 200: one("Transfer"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/members": {
    get: {
      summary: "List members (names, roles, borrowing standing)",
      tags: ["Members"],
      ...scope("read:members"),
      parameters: [...pageParams, query("role", "MANAGER, STAFF, MEMBER or TECHNICIAN."), query("borrowing", "GOOD, RESTRICTED or SUSPENDED."), query("status", "ACTIVE or SUSPENDED.")],
      responses: { 200: page("Member"), ...errors("Invalid", "Unauthorized", "Forbidden") },
    },
  },
  "/reports/valuation": {
    get: { summary: "Stock valuation (on hand × average cost, plus in transit)", tags: ["Reports"], ...scope("read:reports"), responses: { 200: plainJson("`{ data: { currency, totalMinor, inTransitMinor, byCategory[], byLocation[], items[] } }`"), ...errors("Unauthorized", "Forbidden") } },
  },
  "/reports/low-stock": {
    get: { summary: "Items at or below their reorder point", tags: ["Reports"], ...scope("read:reports"), responses: { 200: plainJson("`{ data: [{ itemId, sku, name, available, reorderPoint, reorderQuantity, onOrder, supplier }] }`"), ...errors("Unauthorized", "Forbidden") } },
  },
  "/reports/overdue": {
    get: { summary: "Overdue loans", tags: ["Reports"], ...scope("read:reports"), responses: { 200: plainJson("`{ data: [{ loanId, reference, dueAt, daysOverdue, units, borrower: { name } }] }`"), ...errors("Unauthorized", "Forbidden") } },
  },
} as const;
