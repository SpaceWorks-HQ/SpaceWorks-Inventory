# Handoff: Space Works Inventory

Read this first, then `CLAUDE.md` (same as `AGENTS.md`), `docs/ARCHITECTURE.md`, `docs/INVARIANTS.md`
and `docs/RBAC.md`. Snapshot taken 2026-10-23.

## Where this repo fits

Space Works is a family of self-hosted, open-source (AGPL-3.0-or-later) tools for makerspaces and
communities, published under the [SpaceWorks-HQ](https://github.com/SpaceWorks-HQ) GitHub org.
The original product, [SpaceWorks](https://github.com/SpaceWorks-HQ/SpaceWorks) (Django + React), bundles
inventory, lending, machines, 3D printing, space bookings and payments in one app. On 2026-10-23 three of
those areas were split out into **standalone apps**, each in its own repo:

| Repo | What it is |
| --- | --- |
| [SpaceWorks-Inventory](https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory) | Stock room and lending desk: setup wizard, catalogue, QR, counts, transfers between locations and spaces, free or paid member lending |
| [SpaceWorks-Machines](https://github.com/SpaceWorks-HQ/SpaceWorks-Machines) | Machine types and catalogue, job/service requests (3D printing, laser, CNC…), pricing and payments, consumables, maintenance and usage logs, 3D-printer hardware adapter layer |
| [SpaceWorks-Bookings](https://github.com/SpaceWorks-HQ/SpaceWorks-Bookings) | Space booking (rooms, studios, desks, halls) with every payment and refund scenario |

Sibling apps on the same stack, used as the reference for structure, install and deploy:
[SpaceWorks-Events](https://github.com/SpaceWorks-HQ/SpaceWorks-Events),
[SpaceWorks-Workspace](https://github.com/SpaceWorks-HQ/SpaceWorks-Workspace) and SpaceWorks-Organization.
Brand and UI rules come only from [SpaceWorks-Design](https://spaceworks-hq.github.io/SpaceWorks-Design/).

## Decisions already made (do not re-open without the owner)

- **Stack:** Next.js 16 + React 19 + TypeScript, PostgreSQL 16 with Prisma, Auth.js, Tailwind 4 + Radix,
  Redis with a BullMQ `worker` and `beat`, S3-compatible private storage (Silo on a VPS), Vitest and
  Playwright. Domain logic is *ported* from the Django SpaceWorks code, not copied.
- **Multi-space:** one install runs several makerspaces; every tenant row and query is scoped to one.
- **Own accounts per app** (email + password, magic link, TOTP MFA). No SSO.
- **Fully standalone:** no runtime dependency on any other Space Works app. Integration happens later
  through each app's REST API (API keys) and signed outbound webhooks.
- **Free and paid everywhere:** every flow works free or paid. Payments use Razorpay, Stripe,
  offline (cash/bank/UPI recorded by staff) or pay later (shown as *payment pending*), with refunds.
- **Nothing hardcoded:** the Space manager has makerspace-wide settings; the domain manager
  (Inventory / Machine / Bookings manager) has their own settings area; both are RBAC-gated and every
  settings change is audited.
- **Ship requirements:** a README with real Playwright screenshots (light and dark) under
  `docs/screenshots/`, a one-line VPS install (`curl -fsSL …/main/install.sh | bash`) and one-click
  cloud hosting (`render.yaml` + Deploy to Render button).

## How work is done here

- `dev` is the integration branch; `main` is production and only **Shaan-Shoukath** merges into it
  (branch protection + `.github/CODEOWNERS`). Branch from `dev`, open PRs into `dev`.
- Work in phases; each phase ends with lint, typecheck and tests green, a commit and a push to `dev`.
- `CLAUDE.md` and `AGENTS.md` are byte-identical; edit one, copy it over the other.
- The original build was done by Claude Code sessions (no Codex). Any coding agent can continue from
  this file plus `CLAUDE.md`.

## Status (2026-10-23)

**Done and committed on `dev`:** platform foundation, catalogue (items, locations, taxonomy, assets, kits,
QR codes), transfer workflow between locations and spaces, cycle counts and purchasing, the lending
workflow (free or paid lending, import, labels), demo seed, architecture/invariant/RBAC/testing docs,
README with banner art and the screenshot capture script, catalogue, stock, space admin, setup wizard,
reports and REST API UI, free-plan inline jobs and payment webhooks, e2e harness.

**Last commit, work in progress (`wip:`):** the staff and member UI for lending, transfers, counts and
scanning. That covers `app/s/[spaceSlug]/{loans,my-loans,transfers,counts,scan,catalogue}`,
`app/actions/{loans,transfers,counts,scan}.ts`, the evidence upload API, and `components/{borrow,counts,desk,loans,transfers}`.
`lib/views/generated/*` and `frontend/*.json` are regenerated outputs. When it was committed, typecheck
was clean and all 1050 unit tests passed. Integration and e2e tests were not re-run on it.

**Phase I1 (2026-10-23, Claude Code driving Codex):** the lending, transfer, count and scan UI is
finished and covered by e2e journeys (`tests/e2e/{lending-desk,member-loans,transfers,counts,scan}.spec.ts`;
label codes come from `tests/e2e/labels.ts`). The split frontend gate (`typecheck:frontend`,
`build:frontend`) passes for the first time (`frontend/pure-exports.json` was never committed). The
hosting harness runs the signed-in journeys with `--external-services --demo`. Fixed on the way: wide
tables widened the page at phone width, optional field labels read "RemarksOptional" to screen readers,
and transfer receipt could be submitted before the required label scans.

**Phase I2 (2026-10-23):** independent review and design polish of the desk UI. Security and data fixes:
members can no longer learn another borrower's loan status (`lockLoan` checks ownership first), the member
loan page gets a borrower-only view (`lib/desk/memberLoanView.ts`), posting a count no longer writes off
untouched serialized tools and stores posted variances, count schedules are audited, "My loans" keeps
every active loan. The desk UI now mirrors the workflow rules (exact tag counts, payment readiness,
renewal eligibility, label scans on receipt, text limits). Design: a shared step heading for desk flows,
destructive confirmations for lost units and write-offs, variance words, 44px row links, a mobile
request bar, filtered empty states, item image fallback, and the inbox badge no longer covers its label.
Left for later: issue scan catalogues are capped at 500 eligible tags per loan (codes beyond that are
not resolved on demand).

## What is left

1. ~~Finish and click-test the WIP pages above against the workflows in `lib/lending`, `lib/transfers`
   and `lib/counts`, then run `npm run test:integration` and `npm run test:e2e`.~~ Done in I1.
2. Capture the real README screenshots (light and dark) into `docs/screenshots/` with the existing
   capture script, and link them in `README.md`.
3. Verify the one-line VPS install and the Render deploy end to end, and fix anything they surface.
4. Run an independent review pass and design polish against SpaceWorks-Design, then fix the findings.
5. Bump `VERSION` and update `CHANGELOG.md`, then open the `dev → main` PR for the owner.

## Run it locally

`cp .env.example .env`, then `./local.sh` (or `npm ci && npm run db:migrate && npm run db:seed:demo &&
npm run dev`). Checks: `npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:integration` (needs Postgres), `npm run test:e2e`.
