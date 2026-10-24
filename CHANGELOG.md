# Changelog

All notable changes to Space Works Inventory are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/). Each release's published
build is tagged `v<version>-main.<run>.<commit>`; see
[Releases](docs/CONTAINER_IMAGES.md#versions-and-releases).

## [Unreleased]

- Add first-use instructions to Project mentor before private Telegram linking,
  project questions, catalogue alternatives and native desk handoff.
- Link native mentor recordings, sanitized agent evidence and the bot checklist.
  Verify actual local @mentortsbot mentoring and normal synthetic loan LN-0010;
  suggestions do not issue stock and agent writes still await human merge.

- Document embedded agent hosting, native module locations, separate bot/model
  processes, persistent state and deployment verification. Explicitly identify
  the Telegram build/service and CLI additions missing from current images.

- Add a separate Inventory Telegram worker with authenticated single-use account
  linking/revocation, private durable web/worker stores, fresh host membership
  checks and the native integration merge gate. The Project mentor page exposes
  private link controls; operators explicitly configure and start the bot.

- Add a staff project mentor backed by the space's actual catalogue capability
  tags and current availability, with read-only local Codex planning and native
  item/lending handoffs.
- Add a host-authenticated, tenant-scoped SpaceWorks Agents adapter for confirmed
  manager stock receipts/adjustments and native loan requests/approvals. Durable
  PostgreSQL command receipts prevent duplicate effects; merge/deployment checks
  keep unreviewed integration writes inactive. Physical scans and photographs
  remain on the existing lending desk.

## [0.5.0] - Unreleased

The first public release: everything since the split from SpaceWorks
(the 0.2.0 work is folded in; 0.1.0 and 0.2.0 were never released).

### Added

- **Repairs.** Report a damaged or broken item or asset (members too, and
  straight from a damaged-item loan incident) with severity and photos; take
  it out of use through the availability module; a technician directory of
  members with the new Technician role and external contacts with skills;
  send a request to the technicians you pick by email, WhatsApp and Telegram;
  external technicians work through a private link; the first to accept gets
  the job; fix notes, parts, photos and the amount asked; verify and close or
  reopen; approve and pay (partial payouts, append-only payout ledger); parts
  go on the buy list linked to the repair; a Repairs report and webhooks
  `issue.reported`, `issue.assigned`, `issue.resolved` and `repair.paid`.
- **Finance** (inventory managers only). One append-only ledger for every
  money movement, posted with its source: loan payments, refunds and returned
  deposits, repair payouts, purchases when bought (amount, method, reference
  and supplier required) and manual income or expenses, with reversals. The
  Finance page shows income, expenses and net by day, week, month or
  financial year, by category, method, item, technician and supplier, links
  each entry to its source and downloads as CSV or Excel (audited). History is
  backfilled; a ledger check compares it with its sources. The valuation
  report gains spend by item and cost per asset; webhook
  `finance.entry_posted`.
- **Paged desk flows.** Issue, return, self-return, self-checkout, dispatch,
  receive and receive-return are a stepper: one step at a time, Next only
  when the step is ready, earlier steps reachable from the indicator, and a
  "done" card on the record page afterwards.
- **Scans beyond the preloaded list.** Issue and dispatch scanners ask the
  server about codes they didn't preload, so large spaces are no longer
  capped at 500 tags or 300 containers.
- **Self-checkout switched off** now explains why to members (and links to
  the catalogue) instead of answering not-found; its scanner also resolves
  codes beyond the 300 items and 100 tags it preloads.
- **Easter eggs** (docs/DESIGN.md): Patch walks the 404 page (trots to the
  pointer, paw prints, naps, hearts when patted), mood tiles wiggle, Patch
  peeks out of an empty shelf's bin, sneezes at a count with no variance and
  trots home when a loan comes back in full.
- **Motion:** the colour-mode switch grows the new mode as a feathered circle
  from the pressed toggle or Appearance option (720ms; a cross-fade without
  View Transitions; instant under reduced motion), buttons settle when
  pressed, and the QR dialog shows a skeleton plate while it loads.
- README in the Space Works Events layout: hosting, updates, split hosting,
  free cloud hosting, commands and licence.
- **Desk and member UI** for lending (approve, issue and return with scans,
  photos and remarks; renewals; incidents), "My loans", the borrow catalogue
  with a request tray and self-checkout, transfers (approve, dispatch,
  receive, returns), cycle counts and a scan page, with a step heading on
  every desk flow.
- End-to-end journeys for the lending desk, member loans, transfers, counts
  and scanning; the hosting harness runs them against production builds with
  `--external-services --demo`.
- README screenshots in light and dark mode under `docs/screenshots/`.
- A static test of the Render Blueprint.

### Changed

- **Roles: Inventory manager, Staff and Member, plus Technician** (repairs
  only, with an authenticator app). The admin and owner roles are gone; the inventory manager runs the whole space, including
  members, other managers and deleting the space. The space's creator is its
  first manager, and the last active manager can't be demoted, suspended or
  removed, or leave. A migration turns existing owners, admins and their
  pending invitations into inventory managers.
- `docs/DECISIONS.md` records every product and owner decision and the checks
  left for the owner; it replaces `docs/HANDOFF.md`.

### Fixed

- Signing in with an authenticator app never asked for the code (the form
  sent a missing code as the text "undefined"), so accounts with two-step
  verification could not sign in with a password or an email link.
- Members can no longer learn another member's loan status, and the member
  loan page no longer receives desk notes, shelves or standing details.
- Posting a count no longer writes off untouched serialized tools; posted
  variances are stored, and count schedule changes are audited.
- The desk UI no longer enables actions the server refuses (tag counts,
  payments, renewals, label scans on receipt, text and quantity limits).
- Wide tables no longer widen the page on phones; optional field labels read
  correctly to screen readers; the inbox badge no longer covers its label.
- The split frontend build: the missing `frontend/pure-exports.json`, Windows
  paths in its scripts, and a contract hash that depended on line endings.
- The first-run setup browser test had never passed (it looked for the wrong
  element and was skipped on retry); browser sign-ins now retry a click that
  landed before the page hydrated, and the development server is warmed up
  before the journeys start. The split-hosting guide's stale page-coverage
  limitation is corrected.

## [0.1.0] - Unreleased (first release candidate)

The first release of Space Works Inventory: a self-hosted stock room and
lending desk for makerspaces, with several makerspaces on one install.

### Added

- **Catalogue.** Quantity-tracked items and serialized assets with QR tags,
  kits, containers, categories, units and suppliers, item photos, and a
  location tree (building → room → shelf → bin).
- **Stock.** Receipts, adjustments with reasons, an append-only stock ledger,
  low-stock alerts with reorder points, stock held for approved loans and
  transfers, units under repair, and valuation.
- **Cycle counts.** Snapshots, counting by scan or by hand, recurring count
  schedules, stale-line detection and four-eyes posting above the variance
  threshold.
- **Transfers.** Between locations of a space and between spaces of the
  install: request, approval, dispatch with scans and photos, partial receipt,
  missing or damaged lines, and returns to the sender.
- **Lending.** A public catalogue, loan requests, approval, issue and return at
  the desk with QR scans, evidence photos and remarks, partial returns,
  renewals, due-date changes, self-checkout and self-return, overdue reminders
  and escalation, and lost or damaged incidents tied to the member's borrowing
  standing.
- **Free or paid lending.** Deposits, rental, late fees and damage charges,
  paid through Razorpay or Stripe (with signed webhooks and reconciliation),
  recorded as cash or bank payments, or deferred with pay later; refunds and
  waivers.
- **Purchasing.** A "to buy" list for restocking.
- **QR labels.** Printable label sheets and a `/q/<code>` landing that opens the
  right page for whoever scans it, plus an in-app camera scanner.
- **Import and reports.** Bulk CSV and XLSX import with error reports, reports
  and CSV exports, and an append-only audit log.
- **People.** Roles (owner, admin, inventory manager, staff, member),
  invitations and optional self-join, member eligibility rules and borrowing
  standing (can borrow, restricted, suspended).
- **Sign-in.** Email and password, emailed magic links and TOTP two-step
  verification with recovery codes; an instance admin area behind a fresh
  authenticator code.
- **Space setup.** A first-run setup wizard for the instance admin and the
  first makerspace, then a guided space setup (locations, categories, lending
  policy, team, optional sample data), and per-space settings for every policy.
- **Notifications and integrations.** Email through a transactional outbox,
  in-app notifications, HMAC-signed outbound webhooks for stock, loan, payment
  and transfer events, and a REST API (`/api/v1`) with scoped API keys and an
  OpenAPI description.
- **Hosting.** A one-line VPS installer (Docker Compose with PostgreSQL, Redis,
  Silo storage and Caddy HTTPS, internal TLS, encrypted off-site backups,
  automatic deploys, hardening and recovery tools), a Render Blueprint, a
  DigitalOcean App Platform spec, a Cloudflare cron Worker, and multi-arch
  backend and frontend images on GitHub Packages.

[Unreleased]: https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory/commits/dev
[0.1.0]: https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory/releases
