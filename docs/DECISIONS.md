# Decisions

[Documentation index](README.md)

Every product decision behind Space Works Inventory, with its date. Read this
first, then `CLAUDE.md` (same as `AGENTS.md`), [Architecture](ARCHITECTURE.md),
[Invariants](INVARIANTS.md) and [Roles](RBAC.md). Decisions marked **locked**
are not reopened without the owner (@Shaan-Shoukath); **defaults** were chosen
conservatively during the build and the owner may revisit them.

## Where this repo fits (2026-10-23)

Space Works is a family of self-hosted, open-source (AGPL-3.0-or-later) tools
for makerspaces and communities under the
[SpaceWorks-HQ](https://github.com/SpaceWorks-HQ) organisation. On 2026-10-23
three areas of the original [SpaceWorks](https://github.com/SpaceWorks-HQ/SpaceWorks)
(Django + React) app were split into standalone apps:
[Inventory](https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory) (this repo:
stock room and lending desk),
[Machines](https://github.com/SpaceWorks-HQ/SpaceWorks-Machines) and
[Bookings](https://github.com/SpaceWorks-HQ/SpaceWorks-Bookings).
[SpaceWorks-Events](https://github.com/SpaceWorks-HQ/SpaceWorks-Events) and
[SpaceWorks-Workspace](https://github.com/SpaceWorks-HQ/SpaceWorks-Workspace)
are the reference for structure, install and deploy; brand and UI rules come
only from [SpaceWorks-Design](https://spaceworks-hq.github.io/SpaceWorks-Design/).

## Locked at the split (2026-10-23)

- **Stack:** Next.js 16, React 19 and TypeScript; PostgreSQL 16 with Prisma;
  Auth.js; Tailwind 4 and Radix; Redis with a BullMQ `worker` and `beat`;
  S3-compatible private storage (Silo on a VPS); Vitest and Playwright.
  Domain logic is ported from the Django code, not copied.
- **Multi-space tenancy:** one install runs several makerspaces; every tenant
  row and query is scoped to one space.
- **Own accounts:** email and password, magic link and TOTP MFA per app. No SSO.
- **Standalone:** no runtime dependency on another Space Works app.
- **Free and paid:** every flow works free or paid. Payments use Razorpay,
  Stripe, offline (cash, bank or UPI recorded by staff) or pay later (shown as
  payment pending), with refunds.
- **Nothing hardcoded:** policy lives in audited, role-gated settings, not
  constants.
- **Ship requirements:** a README with real Playwright screenshots under
  `docs/screenshots/`, a one-line VPS install and one-click cloud hosting
  (`render.yaml` and a Deploy to Render button).
- **Inventory-specific:** stock moves only through `lib/inventory/availability`
  (holds, issue, return, loss) and the append-only movement ledger; QR codes on
  items, assets, containers and locations; scans and photo evidence at every
  lending and transfer handover; transfers between locations and between the
  spaces of one install, each side checked against its own membership.

## Owner decisions (2026-10-24)

1. **Roles.** There is no space-manager, admin or owner role. The inventory
   manager (`MANAGER`) is the top role with full access, every setting
   included, then Staff and Member. Whoever creates a space (the setup wizard,
   or the instance admin naming a manager) becomes its first manager;
   managers manage everyone, other managers included, and delete the space. A
   space always keeps at least one active manager. Existing owners, admins
   and their invitations were migrated to inventory managers. A **Technician**
   role does repairs only and needs an authenticator app. See [Roles](RBAC.md).
2. **Branches.** Only two long-lived branches: `dev` (integration) and `main`
   (production). No feature or phase branches are kept: work lands on `dev`,
   `dev` merges to `main`, and only @Shaan-Shoukath pushes or merges to `main`
   (branch protection restricts pushes to him, enforces it for admins, blocks
   force pushes and deletions; `.github/CODEOWNERS`).
3. **Releases.** Pushes to `dev` publish gated test images tagged `dev`; merges
   to `main` publish the release images and the GitHub Release; the one-line
   VPS install (`curl -fsSL …/main/install.sh | bash`) installs from `main`.
   See [Releases and container images](CONTAINER_IMAGES.md).
4. **Standalone apps.** Each app has its own accounts and no runtime
   dependency on the others; integration is only through its REST API (API
   keys) and signed outbound webhooks.
5. **Build tooling.** Phases I1 to I5 (2026-10-23) were Claude Code driving
   Codex; from I6 (2026-10-24) the build is Claude Code alone, which writes,
   tests and adversarially reviews every phase. Commits carry
   `Co-Authored-By` trailers for Shaan-Shoukath and Claude.
6. **README.** It follows SpaceWorks-Events: banner, light screenshots,
   one-line install and Render, with the Patch easter eggs and the Events
   light/dark circular reveal ([Design](DESIGN.md) 4.14).
7. **Version.** The first public release is **0.5.0** (it replaces the
   earlier 0.2.0 plan; 0.1.0 and 0.2.0 were never released).
8. **Repairs.** A damaged or broken item or asset (also from a loan incident)
   is reported with severity, photos and a description. Each space keeps a
   directory of technicians: members with the Technician role and external
   contacts (email, phone, WhatsApp, Telegram, skills, preferred channel,
   notes, active). The manager picks one or more technicians (filtered by
   skill) and sends the request by email plus WhatsApp and Telegram where set
   up; external technicians get their own link (32 random bytes, SHA-256
   stored, one repair, expires, closes when taken, withdrawn, unassigned or
   closed). The first to accept is assigned and the others are told. The
   technician records fix notes, parts, photos and the amount asked; the
   manager verifies and closes (or reopens with a reason), approves the
   amount (a different amount needs a reason) and records payouts (cash, bank
   transfer, UPI or other, reference required except cash, partial payouts
   allowed) in an append-only payout ledger. Stock under repair is
   quarantined only through `lib/inventory/availability`. The buy list stays;
   parts for a repair go on it linked to the repair.
9. **Finance.** Every money movement posts one entry to an append-only
   `FinanceEntry` ledger in the same transaction as its source: settled loan
   payments (deposits, rental, late, damage and loss charges), processed
   refunds and returned deposits, repair payouts, purchases when bought (the
   amount, method, reference and supplier are required) and manual income or
   expenses. Corrections are reversing entries; one currency per space (the
   currency locks once money is recorded). History was backfilled. The
   Finance page, money reports and exports, spend columns, KPIs and payouts
   are for the **inventory manager only**; a technician sees only the amount
   they asked and whether it is paid.
10. **No pauses.** The build continues without waiting for owner decisions;
   commits stay local on `dev` until the owner's QA.

## Defaults the owner may revisit

### Agent integration phase (2026-10-25)

At the owner's request, SpaceWorks Agents is embedded against this app's own
accounts, memberships and native availability/lending services. Codex assists
implementation; runtime project mentoring may use the installed Codex CLI with
`gpt-6-luna` after explicit operator configuration. Mentor output is a read-only
discussion and links to native workflows. The existing QR, photo, payment and
role rules are preserved. Reviewed dev integration and deployed-revision checks
gate adapter mutations; PostgreSQL command receipts commit with domain effects.
See [the integration guide](AGENTS-INTEGRATION.md) and
[AI assistance record](AI-USAGE-AGENTS.md).

| Decision | Why |
| --- | --- |
| A space created under `/admin` for someone without an account makes the instance admin its interim manager and invites the named person as manager | A space must always have an active manager; the admin can leave once the invitee joins |
| Self-checkout switched off explains why (and links to the catalogue) instead of answering not-found | Members otherwise think the QR code is broken; it reveals nothing beyond the space's public setting |
| No route-level `loading.tsx` inside spaces | Streaming commits a 200 before a page can refuse, so foreign and unknown records would stop answering 404 |
| Desk scanners preload up to 500 tags and 300 containers, and ask the server for anything else | Keeps the first paint small in large spaces without capping what can be scanned |
| The production harness (`test:e2e:vps` and `test:e2e:split` with `--external-services --demo`, in Linux) is the authoritative browser gate; the Windows dev-server run is secondary | Fast Refresh on Windows can reload pages mid-test; every e2e spec still runs in at least one mode |
| In dark mode the 404 pet sits on a cream chip | The brand pet art is drawn for light backgrounds |
| Easter eggs and the colour-mode reveal are off under reduced motion | Accessibility first; they are decoration |
| A new repair notifies the inventory managers; technicians hear about it only when a manager sends it to them | Owner update 11 (selected technicians) replaces "email every active technician" from update 7 |
| Inventory has no team chat channels; Telegram and WhatsApp are used only to message technicians directly, configured on the Technicians page | Inventory never had team channels; this is the smallest setup that reaches technicians where they are |
| A payment for one kind of charge is filed under it; a payment covering several is "Loan fees" | One ledger entry per payment keeps "each source posts once" exact |
| Stock received without a buy-list purchase (adjustments, imports) does not post to finance | It carries no payment details; buy anything through the buy list to record its cost |
| Backfilled purchases are estimated from unit cost × quantity with method "Other" | The real amount was never recorded before the ledger |
| An external technician's link stays open while they hold the repair and is extended each time they save | Repairs can take longer than the request window |
| Financial years run April to March and weeks start on Monday | Indian convention, matching the default currency and time zone |
| Manual entries have no receipt photo yet | The owner listed it as optional; the note and reference carry the receipt number |
| Unit costs on the buy list are shown only to inventory managers | Finance is for the top role only |

## Owner checks (cannot be run from a development machine)

| Check | Accepted when |
| --- | --- |
| A real Render deploy from `render.yaml` (Deploy to Render button) | The Blueprint creates every service; web, worker and beat report healthy; sign-in and the setup wizard work; an uploaded photo survives a redeploy |
| A real VPS install, release path and `--ref dev` | A fresh Ubuntu server installs, the menu's check passes, update, backup and restore work, and HTTPS is issued |
| GHCR publish and release install | The first release from `main` publishes both images and the installer pulls them instead of building |
| Live Razorpay and Stripe test-mode payments | One paid and refunded loan per gateway in test mode, with webhooks applied once |
| Telegram and WhatsApp messages to technicians | A real bot token and an approved WhatsApp template deliver a repair request to a technician's chat; the link in it opens the request |
