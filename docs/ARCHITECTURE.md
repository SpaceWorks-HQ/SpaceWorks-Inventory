# Architecture

[Documentation index](README.md)

## Shape

One Next.js 16 application (App Router, React 19, TypeScript) on PostgreSQL
16 through Prisma 6, with Redis for rate limits and the BullMQ worker and
beat, S3-compatible private storage for photos (Silo on a VPS, Cloudflare R2
in the cloud) and SMTP through a transactional outbox.

```text
Browser / phone camera ──► proxy.ts (rate limits, CSP nonce)
                             │
            ┌────────────────┼─────────────────────┐
            ▼                ▼                     ▼
   Server Components   Server Actions        Route handlers
   (pages: requireSpace) (spaceAction →       (/api/v1 API keys,
                          zod → domain)        payment webhooks,
            │                │                 images, labels, exports)
            └────────────────┼─────────────────────┘
                             ▼
             Domain modules in lib/ (one transaction per step)
   catalogue · inventory/availability · lending/workflow · transfers/workflow
   counts · purchases · payments · importer · reports · labels · events
                             │
         PostgreSQL ◄────────┼────────► outbox rows (email, webhooks)
                             ▼
              BullMQ worker + beat (Redis): outbox delivery, loan reminders,
              count schedules, payment reconciliation, retention
```

Two container images are published per release: **backend** (the whole
application; it also runs the `migrate`, `worker`, `beat` and VPS operator
roles) and **frontend** (a rendering-only build of the same pages for the
split layout, with no database, Redis, mail or storage client; it reaches
the backend through an authenticated gateway, see
[DEPLOYMENT_SPLIT.md](DEPLOYMENT_SPLIT.md)).

## Tenancy

`Space` is one makerspace; one install hosts several. `Membership` links a
`User` to a space with a role and a borrowing standing. Every page calls
`requireSpace(slug, minRole)`; every action starts with
`spaceAction(slug, capability)`; every query filters by `spaceId`. A
transfer between spaces is the only record two spaces share; each step
checks the side that performs it.

## Data model highlights

`prisma/schema.prisma` is authoritative.

| Area | Models |
| --- | --- |
| Identity | `User`, `Account`, `Session`, `VerificationToken`, `MfaRecoveryCode`, `PasswordResetToken`, `EmailVerificationToken`, `MagicLinkToken` |
| Tenancy | `Space` (all policy settings), `Membership`, `Invitation`, `ApiToken`, `SpaceCounter` |
| Catalogue | `Location` (tree), `Category` (tree, lending overrides), `Unit`, `Supplier`, `Item` (quantity or serialized, lending and fee overrides), `ItemImage`, `Asset`, `Kit`, `KitLine`, `Container` |
| Stock | `StockLevel` (on hand, held, under repair per item × location), `StockReservation`, `StockMovement` (ledger), `StockCount`, `StockCountLine`, `StockCountScan`, `CountSchedule`, `PurchaseItem` |
| Transfers | `Transfer`, `TransferLine`, `TransferLineAsset`, `TransferEvent` |
| Lending | `Loan`, `LoanLine`, `Evidence`, `EvidencePhoto`, `LoanIncident` |
| Money | `SpacePaymentConfig`, `LoanCharge`, `Payment`, `Refund`, `GatewayEvent` |
| Platform | `InstanceSetting`, `OutboxMessage`, `OperationalHeartbeat`, `AuditEvent`, `Notification`, `WebhookEndpoint`, `WebhookDelivery`, `ImportJob` |

## Stock buckets

For each item and location, `StockLevel` keeps:

- **on hand**: physically on the shelf, including held and under-repair units;
- **held** (`reserved`): promised to an approved loan or transfer line;
- **under repair** (`quarantined`): present but unusable until repaired or
  scrapped;
- **available** = on hand − held − under repair.

Units on loan or in transit are not on any shelf; reports derive them from
the loan and transfer lines. Serialized items keep the same balances, with
one `Asset` per physical unit whose `status` and `locationId` move in step.
See [INVARIANTS.md](INVARIANTS.md).

## Flows

- **Loan**: request → approve (holds stock, raises deposit/rental charges)
  → issue (scans, photos, payment gate, eligibility) → return in one or more
  parts (good back on a shelf, damaged to the repair shelf, lost written off,
  incidents and charges) → returned or closed with an issue. Renewals,
  due-date changes, self-checkout and self-return use the same module.
- **Transfer**: request (by the sending or receiving space) → approve (holds
  at the source location) → dispatch (pick-list scans, photos; stock leaves)
  → in transit → receive in parts (good or damaged) / declare missing / send
  back → receive the return at the source. Between spaces, receipts map to
  the destination's item with the same SKU (or create it).
- **Cycle count**: start (snapshot) → count or scan → submit → post (four-eyes
  above the variance threshold; stale lines refused).
- **Payments**: charges per loan; members pay through Razorpay or Stripe,
  choose pay later, or staff record cash/bank payments; webhooks settle
  payments once; deposits are refunded fully or partly with a reason.

## Background work

The outbox stores every email and webhook delivery in PostgreSQL inside the
transaction that caused it. The BullMQ worker delivers them with retries;
the beat schedules periodic jobs (`lib/scheduled/index.ts`): outbox relay,
loan reminders and escalations, count schedules, payment reconciliation and
retention. Without Redis in development, `JOBS_INPROCESS=true` runs the same
jobs in the web process. `POST /api/internal/outbox?run=inline` (with `CRON_SECRET`)
runs everything once inside the web process, for hosts without a worker (the
free-plan cron Worker calls it every minute); without `run=inline` it only
queues due outbox rows for the worker.

## Integrations

- **REST API** under `/api/v1` with space-bound API keys and scopes
  ([API.md](API.md)).
- **Webhooks**: every domain event in `lib/events/catalogue.ts` is delivered
  to subscribed endpoints, HMAC-signed (`X-SpaceWorks-Signature:
  t=…,v1=…`), to public addresses only, retried with backoff and switched off
  after repeated failures.
- **Email**: transactional messages through the instance SMTP settings.
