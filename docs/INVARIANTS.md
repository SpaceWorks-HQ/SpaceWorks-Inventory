# Invariants

[Documentation index](README.md)

These rules hold for every screen, API call and background job. Each names
where it is enforced and the tests that prove it. Do not weaken one for a UI
shortcut; change this file in the same pull request if a rule ever changes.

## Stock

1. **One module owns all quantity math.** `lib/inventory/availability` is the
   only writer of `StockLevel`, `StockReservation`, `StockMovement`,
   `Asset.status` and `Asset.locationId`. Loans, transfers, counts, purchases,
   imports and the sample data all call it.
2. **Availability never goes below zero.** For every item and location,
   `available = onHand − reserved − quarantined ≥ 0`, and no bucket is
   negative. The module throws `StockError` first; the database refuses it as
   a last line of defence (`StockLevel_*` CHECK constraints in the init
   migration). Tests: `tests/integration/availability.db.test.ts` (including
   six concurrent takes of three units).
3. **Stable lock order.** Loan or transfer row → `Item` rows (by id) →
   `StockLevel` rows (by item, location) → `Asset` rows (by id), all
   `SELECT … FOR UPDATE` inside the caller's transaction.
4. **Every balance change writes one ledger row.** `StockMovement` records
   the signed change to on hand, held and under repair, the balance after,
   the reason, the actor and what caused it (`refType`/`refId`).
5. **Holds equal reservations.** `StockLevel.reserved` always equals the sum
   of open `StockReservation` rows for that item and location. Approval
   creates holds; issue, dispatch, rejection and cancellation consume or
   release them.
6. **Units in transit or on loan belong to no shelf.** They leave `onHand`
   when issued or dispatched and are reported as "on loan" / "in transit"
   from the loan and transfer lines until they come back or are written off.

## Workflows

7. **One module owns each state machine.** Loan status changes only in
   `lib/lending/workflow`, transfer status only in `lib/transfers/workflow`,
   count status only in `lib/counts`. Every step locks its row first and
   re-checks the status it acts on (`canTransition`, `canTransfer`).
8. **Handovers need proof.** Issuing and returning a loan require: a scan of
   every serialized unit's asset tag; for quantity items, a scan of the item
   label or of the loan's container; the container scan when the space
   requires containers or the loan was packed in one; at least
   `Space.minEvidencePhotos` photos; remarks on return (and on issue when
   `requireIssueRemarks`). Self-checkout, transfer dispatch and transfer
   receipt record the same evidence. Tests:
   `tests/integration/lending-workflow.db.test.ts`, `transfers.db.test.ts`.
9. **Evidence, the ledger and the audit log are append-only.** Database
   triggers (`swi_append_only`) refuse updates to `Evidence`,
   `EvidencePhoto`, `StockMovement` and `AuditEvent`, except a foreign key
   being nulled by `ON DELETE SET NULL`.
10. **Issued quantity never exceeds approved, returned never exceeds issued.**
    CHECK constraints on `LoanLine` and `TransferLine`.
11. **One active loan per container** (partial unique index).
12. **Cycle counts post only against an unchanged snapshot.** A line whose
    balance moved since the count started is stale and must be recounted.
    Variances above the space threshold need a poster who neither started nor
    counted the count.

## People and money

13. **Borrowing standing is checked at request and again at every handover.**
    `lib/lending/access.ts` checks lending is on, standing is GOOD, email
    verified and membership number present when required, and the loan and
    item limits. Open incidents and overdue loans restrict a member
    automatically (per space setting) and lift the restriction when cleared;
    a manager's manual status is never lifted automatically.
14. **Money is integer minor units.** Charges never go below zero and refunds
    never exceed what was paid (CHECK constraints); a payment is settled
    exactly once, and each provider webhook event is applied once
    (`GatewayEvent`). Deposits and rental must be paid or marked pay later
    before issue when `paymentBeforeIssue` is on.

- **Every money movement is in the finance ledger.** Settled payments,
  processed refunds, repair payouts and bought purchases post exactly one
  `FinanceEntry` in their own transaction (`lib/finance/sources.ts`;
  unique per source). The ledger, repair payouts and the repair timeline are
  append-only (database trigger); corrections are reversing entries, and
  `ledgerCheck` compares the ledger with its sources. One currency per space.
- **Repairs hold stock only through the availability module** (an asset goes
  to MAINTENANCE, quantity stock to the quarantined bucket) and release it
  when the repair closes or is cancelled. Money is for inventory managers
  only; a technician sees only the amount they asked and whether it is paid.

## Tenancy and security

15. **The space is the tenant boundary.** Every query filters by `spaceId`
    after a membership check. Unknown, archived and foreign spaces, records
    and QR codes all answer the same not-found. A transfer between spaces is
    visible to both spaces; each step checks the actor's role in the space
    that performs it (`assertSide`).
16. **Settings, not constants.** Every policy lives in
    `lib/settings/sections.ts` with the role that may change it, and every
    settings change is audited with the changed field names (never values).
17. **Secrets are never stored or shown in plain text.** Bearer capabilities
    are SHA-256 hashed; payment and webhook secrets are AES-GCM encrypted with
    a purpose-specific subkey and write-only in the UI.
18. **Photos are re-encoded.** Uploads are decoded under a pixel limit,
    rotated, resized, stripped of metadata and stored as WebP under a
    tenant-prefixed random key, and served only through routes that check
    membership (and, for evidence, staff role or the borrower).
