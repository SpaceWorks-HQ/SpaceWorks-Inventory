<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Space Works Inventory agent guide

> **Start here:** `docs/DECISIONS.md` explains what this repo is (a standalone app split out of SpaceWorks, part of the SpaceWorks-HQ family), every decision already made and the checks left for the owner.

`CLAUDE.md` is a byte-identical copy of this file so every coding agent reads
the same rules. Edit `AGENTS.md`, then copy it over `CLAUDE.md`
(`tests/unit/agent-guidance.test.ts` fails when they differ).

## Product at a glance

Space Works Inventory is the self-hosted stock room and lending desk for
makerspaces. One install runs several makerspaces (`Space`). It covers the
catalogue (quantity-tracked items and serialized assets with QR tags),
locations (building → room → shelf → bin), stock receipts, adjustments with
reasons, cycle counts, low-stock alerts and valuation; transfers between
locations of a space and between spaces of the install; member lending
(public catalogue, requests, approval, QR + photo-evidence issue and return,
renewals, overdue reminders, lost/damaged incidents tied to the member's
borrowing status, self-checkout); free or paid lending (deposits, rental,
late fees, damage charges through Razorpay, Stripe, cash/bank or pay later,
with refunds and waivers); purchasing ("to buy"); bulk CSV/XLSX import;
reports and exports; an append-only audit log; email and in-app
notifications; signed outbound webhooks; and a REST API with API keys.
It is an original Space Works product, licensed AGPL-3.0-or-later, and fully
standalone: no dependency on the other Space Works apps.

Stack: Next.js 16 App Router (`output: "standalone"`), React 19, TypeScript,
PostgreSQL 16 with Prisma 6, Auth.js v5 (JWT sessions; email + password,
emailed magic links, TOTP MFA), Tailwind CSS 4 + Radix primitives, Redis
(rate limits, BullMQ worker and beat), S3-compatible private storage (Silo on
the VPS, Cloudflare R2 in the cloud), Nodemailer through an outbox, Vitest
and Playwright.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/s/[spaceSlug]/` | Everything inside a space, one folder per area |
| `app/actions/` | Server Actions, one file per domain |
| `app/admin/`, `app/admin-mfa/` | Instance admin (TOTP step-up) |
| `app/api/v1/` | REST API (API keys) |
| `app/api/payments/` | Razorpay and Stripe webhooks |
| `app/q/[code]` | Public QR landing (resolves to the right page for the viewer) |
| `lib/inventory/availability/` | **The only writer of stock balances, asset whereabouts and the ledger** |
| `lib/lending/` | **The loan workflow (only writer of loan state)**, eligibility, reminders |
| `lib/transfers/` | **The transfer workflow (only writer of transfer state)** |
| `lib/catalogue/` | Items, locations, taxonomy, assets, kits, containers, QR codes |
| `lib/repairs/` | Repairs, the technician directory, requests and external links (`app/r/[token]`), payouts |
| `lib/finance/` | **The finance ledger's only writer** (`postFinanceEntry`), source posting rules, reports, consistency check |
| `lib/counts/`, `lib/purchases/`, `lib/payments/`, `lib/importer/`, `lib/reports/`, `lib/labels/` | Their areas |
| `lib/events/` | Event catalogue, signed webhook delivery |
| `lib/settings/sections.ts` | Every space setting, its schema and the role that may change it |
| `components/ui/` | Brand primitives (button, field, select, choice, dialog, menu, tabs, table, display) |
| `prisma/` | `schema.prisma` and migrations (the init migration adds CHECK constraints and append-only triggers) |
| `tests/unit`, `tests/integration` (`*.db.test.ts`), `tests/e2e` | Vitest, PostgreSQL integration, Playwright |

`prisma/schema.prisma` is authoritative for the data model. Read it first.

## Invariants (never weaken these)

1. **One availability module owns all quantity math.** Only
   `lib/inventory/availability` writes `StockLevel`, `StockReservation`,
   `StockMovement`, `Asset.status` and `Asset.locationId`. Every function takes
   the caller's interactive transaction and locks rows in a fixed order:
   loan/transfer row → `Item` rows → `StockLevel` rows → `Asset` rows.
2. **Availability never goes below zero.** `available = onHand - reserved -
   quarantined`. Functions throw `StockError` first; database CHECK
   constraints refuse a negative bucket or holds larger than on hand.
3. **One workflow module owns each state machine.** Loan status changes only
   in `lib/lending/workflow`, transfer status only in `lib/transfers/workflow`,
   count status only in `lib/counts`, repair status only in `lib/repairs`.
   Never update `status` columns elsewhere.
4. **Handovers need proof.** Issuing and returning a loan requires the QR
   scan of every serialized unit (and of the container when one is used),
   at least `Space.minEvidencePhotos` photos and remarks (return remarks are
   always required). Self-checkout and transfer dispatch/receipt record the
   same evidence. Evidence rows, the stock ledger and the audit log are
   append-only (database triggers).
5. **Tenancy.** `Space` is the tenant boundary. Every query on tenant data
   filters by `spaceId` after a membership check. Unknown, archived and
   foreign spaces, items, scans and records all answer the same not-found.
   Transfers between spaces check each side against its own membership.
6. **Settings, not constants.** Policy lives in `lib/settings/sections.ts`
   (every section needs MANAGER, the inventory manager)
   and every settings change is audited with the changed field names.
7. **Every money movement is in the ledger.** Payments, refunds, repair
   payouts and bought purchases post one `FinanceEntry` (unique per source)
   in the same transaction; the ledger, payouts and repair timeline are
   append-only (database trigger). Never write money rows outside their
   workflow; corrections are reversing entries.

## Roles (RBAC)

MANAGER > STAFF > MEMBER, plus TECHNICIAN (repairs only, ranked below MEMBER
so no member page opens for it); there is no admin or owner role. Capabilities live
in `lib/roles.ts` (`ROLE_MATRIX` is the documented matrix, `docs/RBAC.md` the
prose). MEMBER borrows; STAFF runs the desk (approve loans, issue/return,
counts, dispatch/receive, take payments); MANAGER, the inventory manager, runs
the whole space: stock, catalogue, settings, payments, members (other managers
included), API keys, webhooks, the audit log and deleting the space. A space's
creator becomes its first manager, and `lib/membership.ts` refuses to demote,
suspend or remove the last active manager (row-locked, tested). Money (the
Finance page, money reports and exports, payouts) is MANAGER only
(`canViewFinance`).
Member borrowing standing (`GOOD`, `RESTRICTED`, `SUSPENDED`) is separate from
the role and checked by `lib/lending/access.ts`.

## Working conventions

- Server Components by default. Add `"use client"` only for state, effects,
  event handlers or browser APIs. Server modules start with `import "server-only"`.
- **Pages** inside a space call `await requireSpace(spaceSlug, minRole)`
  themselves (layouts do not re-run on client navigation;
  `tests/unit/page-guards.test.ts` enforces it). Keep data loading in the
  statements before the first JSX statement of the page: the split-frontend
  generator (`npm run frontend:catalog`) turns that prefix into a guarded
  backend view reader. Never import `@/lib/db` in a client component.
- **Server Actions** (`app/actions/<domain>.ts`): `spaceAction(slug,
  capability)` from `lib/actionContext.ts` (auth → space → capability → rate
  limit) → `zod.safeParse` → domain service inside `prisma.$transaction` →
  audit → `revalidatePath` → `ActionResult`. Catch `DomainError`/`StockError`
  with `domainFailure`. A `"use server"` file exports only async functions.
- Domain services take `(tx, spaceId, input, actor)`, throw `DomainError`
  (`lib/domainError.ts`) for refusals, record `recordAuditEvent` and
  `emitEvent` (webhooks) in the same transaction.
- **300-line limit.** Every hand-written file (source, tests, scripts, CSS)
  stays at or under 300 lines (ESLint `max-lines`). Split by responsibility
  behind an `index.ts`. Generated files (`lib/views/generated/`,
  `lib/frontend/registry.ts`, `frontend/*.json`, `frontend/*.d.ts`) are exempt.
- Errors are short, UI-safe sentences that say what happened and what to do.
  Never "Oops" or "Something went wrong".
- Money is integer minor units in the space currency (`lib/format/money.ts`).
  Quantities are whole numbers in the item's unit.
- Dates go through `lib/format/datetime.ts` in the space time zone.
- Write "Space Works" in copy, `SpaceWorks` only in identifiers. No emoji.

## Design system

Follow [docs/DESIGN.md](docs/DESIGN.md) (source of truth:
[SpaceWorks-Design](https://spaceworks-hq.github.io/SpaceWorks-Design/)).
Colours only from tokens (`app/styles/tokens.css` via the utilities in
`app/globals.css`: `bg-canvas`, `bg-panel`, `bg-primary`, `bg-sidebar`,
`sw-*`); never hard-coded hex. Gilroy everywhere, Unbounded (`font-accent`)
for one accent phrase on auth/empty-state heroes only. Teal primary actions,
Workshop Orange only as a fill with an ink label, Citron text-only sidebar,
flat cards with 1px lines, 44px controls with 10px radius, status pills
always carry a word, QR codes on a white plate in both modes, light and dark
mode for everything. `tests/unit/design-fidelity.test.ts` checks the basics.

## Security rules

- Bearer capabilities (invitations, password resets, magic links, API keys,
  webhook secrets) are random and stored only as SHA-256 hashes or encrypted
  (`lib/crypto.ts` purposes). Never log them or put them in audit metadata.
- Payment provider secrets and webhook signing secrets are write-only in the
  UI and encrypted at rest. Payment webhooks verify the provider signature
  and apply each event once (`GatewayEvent`).
- Outbound webhooks are HMAC-signed, target public addresses only (DNS
  pinned per request) and carry ids and quantities, never emails or remarks.
- Photos are decoded, resized, stripped of metadata and re-encoded as WebP
  before storage (`lib/storage`); storage keys are tenant-prefixed and
  served only through routes that check membership.
- Never read, print or commit `.env`; use `.env.example` for names.

## Verification

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run db:test:prepare        # migrate the disposable TEST_DATABASE_URL
npm run test:integration       # wipes data it created in TEST_DATABASE_URL
npm run test:e2e               # Playwright against `npm run dev`
npm run build
```

After adding pages or actions run `npm run frontend:catalog` and commit the
regenerated files.

## Branching

- Only two long-lived branches: `dev` (integration) and `main` (production).
  Work lands on `dev`; `dev` merges to `main`, and only @Shaan-Shoukath pushes
  or merges to `main`. Never push to `main`.
- Commit in small logical steps with conventional messages
  (`feat(loans): …`, `test(transfers): …`) and explicit paths.
- Historical build tooling is recorded in `docs/DECISIONS.md`. The owner's
  2026-10-25 instruction permits Codex assistance, with GPT-6.1 Sol for code
  generation and GPT-6 Luna for runtime mentoring. New commits are authored only
  by Shaan Shoukath's verified identity, without additional co-author trailers.
  Keep truthful AI usage records and required third-party notices. Do not import
  a hackathon starter template; follow SpaceWorks conventions and the supplied
  track guidelines.
