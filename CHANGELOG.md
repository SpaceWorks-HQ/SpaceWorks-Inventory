# Changelog

All notable changes to Space Works Inventory are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [semantic versioning](https://semver.org/). Each release's published
build is tagged `v<version>-main.<run>.<commit>`; see
[Releases](docs/CONTAINER_IMAGES.md#versions-and-releases).

## [Unreleased]

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
