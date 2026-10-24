# Space Works Inventory REST API (v1)

A JSON API for one space, for scripts, dashboards and integrations. The
machine-readable description is served at `GET /api/v1/openapi.json`
(OpenAPI 3.1, no key needed).

Base URL: `https://<your-instance>/api/v1`

## Authentication

Create a key under **Space settings → Integrations → API keys** (inventory
managers). The secret is shown once. Send it on every request:

```bash
curl -H "Authorization: Bearer swi_XXXXXXXXXXXX_<secret>" https://inventory.example.org/api/v1/space
```

- A key belongs to one space and can only see that space's records.
- A key acts for the person who created it, within its scopes. It stops
  working when it is revoked, expires, or its creator is no longer an active
  inventory manager of the space (or their account is disabled).
- Only a SHA-256 of the secret is stored. Lost keys can't be recovered;
  revoke and create a new one.
- Reads are limited to 600 requests a minute per key, writes to 60. Over the
  limit you get `429` with `Retry-After: 60`.

## Scopes

| Scope | Allows |
| --- | --- |
| `read:catalogue` | `GET /space`, `/items`, `/items/{id}`, `/locations` |
| `write:catalogue` | `POST /items`, `PATCH /items/{id}`, `POST /locations` |
| `read:stock` | `GET /stock`, `/assets` |
| `write:stock` | `POST /stock/adjustments`, `/stock/receipts` |
| `read:loans` | `GET /loans`, `/loans/{id}` |
| `write:loans` | `POST /loans`, `/loans/{id}/{approve,reject,cancel}` |
| `read:transfers` | `GET /transfers`, `/transfers/{id}` |
| `write:transfers` | `POST /transfers`, `/transfers/{id}/{approve,reject,cancel}` |
| `read:members` | `GET /members` |
| `read:reports` | `GET /reports/{valuation,low-stock,overdue}` |

Issuing and returning loans, and dispatching or receiving transfers, need QR
scans and photo evidence at the desk, so they are not available through the API.

## Conventions

- **Money** is an integer in minor units of the space currency
  (`120000` = ₹1,200.00 for INR). `GET /space` returns the currency.
- **Quantities** are whole numbers in the item's unit.
- **Dates** are ISO 8601 strings in UTC; send dates with an offset
  (`2026-10-30T09:00:00+05:30`).
- **People** appear by name and membership id only. The API never returns
  email addresses, phone numbers, remarks, evidence photos or secrets.
- Request bodies are JSON with `Content-Type: application/json`. Unknown
  fields are refused.

## Pagination

Lists return `{ "data": [...], "nextCursor": "…" | null }`, ordered by id.
Pass `limit` (1–100, default 25) and `cursor` (the previous `nextCursor`):

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/items?limit=100"
curl -H "Authorization: Bearer $KEY" "$BASE/items?limit=100&cursor=cmh1x2y3z0000"
```

## Errors

Every error has the same shape and a short sentence you can show people:

```json
{ "error": { "code": "CONFLICT", "message": "LN-0042 is ready to collect, so it can't be approved now." } }
```

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `INVALID`, `INVALID_QUANTITY` | Bad input or a business rule refused it |
| 401 | `UNAUTHORIZED` | Missing, invalid, revoked or expired key |
| 403 | `FORBIDDEN` | The key lacks the scope, the member can't borrow, or the step belongs to the other space |
| 404 | `NOT_FOUND` | Not in this space (records of other spaces always answer 404) |
| 409 | `CONFLICT`, `INSUFFICIENT_STOCK`, `ASSET_UNAVAILABLE` | Wrong state for this step, a duplicate, or not enough free stock |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL` | Unexpected failure; try again |

## Endpoints

Examples assume `KEY` holds your key and `BASE=https://inventory.example.org/api/v1`.

### Space

`GET /space`: name, slug, time zone, currency, tag prefix and lending switches.

```bash
curl -H "Authorization: Bearer $KEY" $BASE/space
```

### Items

`GET /items`: items with availability (`onHand`, `reserved`, `quarantined`,
`available`, `onLoan`, `inTransit`). Filters: `q` (name, SKU or exact
barcode), `category` (id), `lendable` (`true`/`false`), `archived=true`.

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/items?q=drill&lendable=true"
```

`GET /items/{id}`: one item, plus stock per location.

`POST /items`: create an item. Only `name` is required; the SKU is generated
from the name when left out. Other fields: `sku`, `description`, `categoryId`,
`unitId`, `supplierId`, `tracking` (`QUANTITY` or `SERIALIZED`), `barcode`,
`brand`, `model`, `tags`, `unitCostMinor`, `reorderPoint`, `reorderQuantity`,
`lendable`, `consumable`, `selfCheckout`, `requiresApproval`, `loanDays`,
`replacementMinor`, `depositMinor`, `rentalMode`, `rentalMinor`,
`lateFeePerDayMinor`, `notes`.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Soldering iron","lendable":true,"unitCostMinor":120000,"reorderPoint":2}' $BASE/items
```

`PATCH /items/{id}`: send only the fields to change; `null` clears optional
text and id fields. Tracking can't change once the item has stock history.

```bash
curl -X PATCH -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"brand":"Hakko","reorderPoint":3}' $BASE/items/$ITEM
```

### Locations

`GET /locations`: filters `parent` (id), `kind` (`BUILDING`, `ROOM`,
`SHELF`, `BIN`…), `archived=true`.

`POST /locations`: `{ name, code, kind?, parentId?, description? }`. Codes
are unique in the space (letters, digits, dots and dashes, upper-cased).

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"Shelf C","code":"R1-C","kind":"SHELF","parentId":"'$ROOM'"}' $BASE/locations
```

### Stock

`GET /stock`: availability per item (`low=true` keeps items at or below
their reorder point; pages may then hold fewer rows than `limit`).
`GET /stock?item={id}`: `{ item, totals, locations[] }` for one item.

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/stock?item=$ITEM"
```

`POST /stock/adjustments`: `{ itemId, locationId, delta, reason, note? }`.
`reason` is one of `FOUND`, `CORRECTION`, `CONSUMED`, `LOST`, `DAMAGED`,
`EXPIRED`, `STOLEN`, `DONATED`, `RETURNED_TO_SUPPLIER`, `OTHER`. A negative
`delta` can only take free stock (not held for loans or transfers).

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"itemId":"'$ITEM'","locationId":"'$SHELF'","delta":-3,"reason":"CONSUMED","note":"Workshop"}' $BASE/stock/adjustments
```

`POST /stock/receipts`: `{ itemId, locationId, quantity, unitCostMinor?,
reason? (RECEIVED, FOUND or DONATED), note? }`. A cost updates the item's
weighted average cost used for valuation.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"itemId":"'$ITEM'","locationId":"'$SHELF'","quantity":20,"unitCostMinor":250}' $BASE/stock/receipts
```

Both answer `201` with the new balance at that location. Serialized items
change stock one asset at a time, in the app. Every change is in the stock
ledger and the audit log (marked as made through this key) and fires the
`stock.adjusted` webhook.

### Assets

`GET /assets`: serialized units with tag, serial number, status, condition
and location. Filters: `item`, `location`, `status`, `tag` (exact).

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/assets?status=ON_LOAN"
```

### Loans

`GET /loans`: filters `status`, `member` (membership id), `overdue=true`.
`GET /loans/{id}`: one loan with its lines.

`POST /loans`: request a loan for a member,
`{ memberId, lines: [{ itemId, quantity }], purpose?, neededFrom? }`. The
member's standing and limits are checked; items that skip approval are
approved at once.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"memberId":"'$MEMBER'","lines":[{"itemId":"'$ITEM'","quantity":1}]}' $BASE/loans
```

`POST /loans/{id}/approve` (`{ quantities?: { "<lineId>": units } }`, holds
the stock), `POST /loans/{id}/reject` (`{ reason }`, shown to the member) and
`POST /loans/{id}/cancel` (`{ reason? }`, before handover).

```bash
curl -X POST -H "Authorization: Bearer $KEY" $BASE/loans/$LOAN/approve
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"reason":"Out for repair this week"}' $BASE/loans/$LOAN/reject
```

### Transfers

`GET /transfers`: transfers this space sends or receives. Filters `status`,
`direction` (`in`, `out`, `internal`). `GET /transfers/{id}`: one transfer.

`POST /transfers`: move stock between this space's locations
(`destinationLocationId` required) or push it to another space of the
install (`destinationSpace` slug; that space must accept transfers). Body:
`{ sourceLocationId, destinationSpace?, destinationLocationId?, lines: [{ itemId, quantity }], reason?, neededBy? }`.

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"sourceLocationId":"'$SHELF_A'","destinationLocationId":"'$SHELF_B'","lines":[{"itemId":"'$ITEM'","quantity":4}]}' $BASE/transfers
```

`POST /transfers/{id}/approve` (`{ quantities? }`) and `/reject`
(`{ reason }`) are for the sending space; `/cancel` (`{ reason? }`) works for
either side before dispatch.

```bash
curl -X POST -H "Authorization: Bearer $KEY" $BASE/transfers/$TRANSFER/approve
```

### Members

`GET /members`: membership id, name, role, status and borrowing standing.
Filters: `role`, `borrowing` (`GOOD`, `RESTRICTED`, `SUSPENDED`), `status`.

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/members?borrowing=RESTRICTED"
```

### Reports

- `GET /reports/valuation`: `{ currency, totalMinor, inTransitMinor, byCategory[], byLocation[], items[] }` (on hand × average cost).
- `GET /reports/low-stock`: items at or below their reorder point, with what is already on order.
- `GET /reports/overdue`: overdue loans with days overdue, units out and the borrower's name.

```bash
curl -H "Authorization: Bearer $KEY" $BASE/reports/valuation
```

## Webhooks

Outbound webhooks (Space settings → Integrations) send the events listed in
`lib/events/catalogue.ts`. Each request carries
`X-SpaceWorks-Signature: t=<unix seconds>,v1=<hex>`, where `v1` is
HMAC-SHA256 of `"<t>.<raw body>"` with the endpoint's signing secret. Recompute
it, compare in constant time and reject timestamps older than five minutes
(see `lib/events/signature.ts`). `X-SpaceWorks-Event` names the event and
`X-SpaceWorks-Delivery` identifies the delivery for de-duplication.
