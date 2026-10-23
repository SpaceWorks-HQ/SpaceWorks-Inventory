import { body, errors, idParam, one, page, pageParams, query } from "./components";

/** Space, items, locations, stock and assets. */
const read = (scope: string) => ({ security: [{ apiKey: [scope] }] });

export const cataloguePaths = {
  "/space": {
    get: { summary: "The space this key belongs to", tags: ["Catalogue"], ...read("read:catalogue"), responses: { 200: one("Space"), ...errors("Unauthorized", "Forbidden", "RateLimited") } },
  },
  "/items": {
    get: {
      summary: "List items with availability",
      tags: ["Catalogue"],
      ...read("read:catalogue"),
      parameters: [...pageParams, query("q", "Search name, SKU or exact barcode."), query("category", "Category id."), query("lendable", "true or false.", { type: "boolean" }), query("archived", "Include archived items.", { type: "boolean" })],
      responses: { 200: page("Item"), ...errors("Invalid", "Unauthorized", "Forbidden", "RateLimited") },
    },
    post: {
      summary: "Create an item",
      tags: ["Catalogue"],
      ...read("write:catalogue"),
      requestBody: body("ItemInput"),
      responses: { 201: one("Item", "Created"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict", "RateLimited") },
    },
  },
  "/items/{id}": {
    get: { summary: "One item with stock per location", tags: ["Catalogue"], ...read("read:catalogue"), parameters: [idParam], responses: { 200: one("Item"), ...errors("Unauthorized", "Forbidden", "NotFound") } },
    patch: {
      summary: "Change some fields of an item",
      description: "Send only the fields to change. `null` clears optional text and id fields. Unknown fields are refused.",
      tags: ["Catalogue"],
      ...read("write:catalogue"),
      parameters: [idParam],
      requestBody: body("ItemInput"),
      responses: { 200: one("Item"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/locations": {
    get: {
      summary: "List locations",
      tags: ["Catalogue"],
      ...read("read:catalogue"),
      parameters: [...pageParams, query("parent", "Parent location id."), query("kind", "SITE, BUILDING, ROOM, SHELF, BIN…"), query("archived", "Include archived.", { type: "boolean" })],
      responses: { 200: page("Location"), ...errors("Invalid", "Unauthorized", "Forbidden") },
    },
    post: { summary: "Create a location", tags: ["Catalogue"], ...read("write:catalogue"), requestBody: body("LocationInput"), responses: { 201: one("Location", "Created"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") } },
  },
  "/stock": {
    get: {
      summary: "Availability per item, or per location for one item",
      description: "Without `item`: a page of items with on hand, held, quarantined, available, on loan and in transit. With `item`: `{ item, totals, locations[] }` for that item.",
      tags: ["Stock"],
      ...read("read:stock"),
      parameters: [...pageParams, query("item", "Item id: balances per location."), query("low", "Only items at or below their reorder point.", { type: "boolean" })],
      responses: { 200: page("StockRow"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound") },
    },
  },
  "/stock/adjustments": {
    post: {
      summary: "Adjust stock with a reason",
      description: "A negative delta may only take free stock. Serialized items change one asset at a time in the app.",
      tags: ["Stock"],
      ...read("write:stock"),
      requestBody: body("Adjustment"),
      responses: { 201: one("Balance", "Recorded"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/stock/receipts": {
    post: {
      summary: "Receive stock",
      description: "Adds stock at a location; a unit cost updates the item's weighted average cost.",
      tags: ["Stock"],
      ...read("write:stock"),
      requestBody: body("Receipt"),
      responses: { 201: one("Balance", "Recorded"), ...errors("Invalid", "Unauthorized", "Forbidden", "NotFound", "Conflict") },
    },
  },
  "/assets": {
    get: {
      summary: "List serialized assets",
      tags: ["Stock"],
      ...read("read:stock"),
      parameters: [...pageParams, query("item", "Item id."), query("location", "Location id."), query("status", "AVAILABLE, ON_LOAN, IN_TRANSIT…"), query("tag", "Exact asset tag, e.g. TSK-000042.")],
      responses: { 200: page("Asset"), ...errors("Invalid", "Unauthorized", "Forbidden") },
    },
  },
} as const;
