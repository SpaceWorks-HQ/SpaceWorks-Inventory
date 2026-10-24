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
- The original build was done by Claude Code sessions. Phases I1–I5 (2026-10-23) were Claude Code driving
  Codex; from 2026-10-24 (I6 on) the rest of the build is Claude Code alone, which writes all code and
  tests and reviews every phase adversarially. Any coding agent can continue from this file plus `CLAUDE.md`.

## Status (2026-10-24, version 0.2.0)

**Done and committed on `dev`:** platform foundation, catalogue (items, locations, taxonomy, assets, kits,
QR codes), transfer workflow between locations and spaces, cycle counts and purchasing, the lending
workflow (free or paid lending, import, labels), demo seed, architecture/invariant/RBAC/testing docs,
README with banner art and the screenshot capture script, catalogue, stock, space admin, setup wizard,
reports and REST API UI, free-plan inline jobs and payment webhooks, e2e harness.

**Finished in I1–I5 (was the last `wip:` commit):** the staff and member UI for lending, transfers, counts and
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

**Phase I3 (2026-10-23): install and deploy checks, what was actually run.**

| Check | How | Result |
| --- | --- | --- |
| Shell and manifest syntax, shellcheck | `npm run deployment:check` in a Linux container with shellcheck | 65 scripts and manifests pass |
| Installer help and unit tests | `bash install.sh --help`; `tests/unit/vps-installer*.test.ts`, `docker-entrypoint.test.ts` on Linux | Pass (they fail on a Windows host only: POSIX paths and bash timing) |
| Render Blueprint, static | `tests/unit/ops-render.test.ts` (new): services, health checks, production env sources, generated secrets, worker/beat builds, references, documented keys | Pass; no `render.yaml` change needed |
| Two-image installer smoke | `CI=true bash scripts/test-vps-install.sh` inside a privileged `docker:27-dind` container (no Linux host here) | Pass: backend and frontend images built, both layouts (split and single) healthy with PostgreSQL TLS, Redis TLS/auth, private Silo bucket, worker and beat; `check.mjs` and `smoke.mjs` pass |
| Production browser suites | `npm run test:e2e:vps` / `test:e2e:split -- --external-services --demo` in a Linux container | 19 and 20 journeys pass |

Found on the way: the frontend contract hash covered raw bytes, so a CRLF checkout produced a hash that a
clean LF checkout (Docker, CI) rejected as stale. `scripts/frontend-source-hash.mjs` now normalises line
endings.

**Deferred checks (cannot be run from a development machine; owner: Shaan-Shoukath)**

| Check | Accepted when |
| --- | --- |
| A real Render deploy from `render.yaml` (Deploy to Render button) | The Blueprint creates every service, web, worker and beat report healthy, sign-in and the setup wizard work, an uploaded photo survives a redeploy |
| A real VPS run of `curl -fsSL …/main/install.sh \| bash` (release path) and `--ref dev` | A fresh Ubuntu server installs, the menu's check passes, update, backup and restore work, HTTPS is issued |
| GHCR publish and release install | The first tagged release publishes both images and the installer pulls them instead of building |
| Live Razorpay and Stripe test-mode payments | One paid and refunded loan per gateway in test mode, webhooks applied once |

## What is left

1. ~~Finish and click-test the WIP pages~~ Done in I1.
2. ~~README screenshots (light and dark) in `docs/screenshots/`~~ Done in I4 (`npm run readme:screens`
   against a production build of the seeded demo).
3. Owner checks in the "Deferred checks" table above: a real Render deploy, a real VPS install, the first
   GHCR release and live payment gateways.
4. ~~Independent review and design polish~~ Done in I2.
5. ~~VERSION and CHANGELOG~~ Done in I5 (0.2.0). Push `dev` and open the `dev → main` PR when the owner
   has done QA (commits since 2026-10-23 are local only).

**Phase I6 (2026-10-24, Claude only):** desk flows are paged (`components/desk/DeskStepper.tsx`: one step
at a time, Next when ready, a "done" card on the record page via `?done=<kind>`, guarded by the record's
status); issue and dispatch scanners resolve codes they didn't preload on the server
(`lib/desk/handoverScans.ts`, tenant-scoped, rate limited), so large spaces are no longer capped at 500
tags; self-checkout explains itself when it is switched off and its scanner resolves codes on demand
too. Also in I6 (owner update 2): the README in the Events layout, Patch easter eggs (404 walk, mood-tile
wiggle, empty bin, perfect count, home again; `docs/DESIGN.md` 4.14), the Events colour-mode reveal on the
toggle and the Appearance card (`lib/colorModeReveal.ts`, `sw-` names), pressed buttons and a skeleton
primitive (no route-level `loading.tsx` inside spaces: streaming would turn not-found refusals into 200s). Every e2e test now really runs: 00-setup had always failed (and been skipped on retry).

## Decisions (owner, 2026-10-24)

- This work is version 0.2.0 (0.1.0 was never released); decided, not folded into 0.1.0.
- Everything is built in full without pausing for owner decisions; commits stay local until owner QA.
- `npm run test:e2e` on Windows runs `npm run dev`, whose Fast Refresh can reload pages mid-test; the
  production harness (`test:e2e:vps` / `test:e2e:split -- --external-services --demo`, in a Linux
  container) is the authoritative browser gate. Every e2e test runs in at least one mode: 00-setup on a
  fresh database (`--external-services` without `--demo`), the magic link on the dev server,
  split-hosting in split mode.

## Run it locally

`cp .env.example .env`, then `./local.sh` (or `npm ci && npm run db:migrate && npm run db:seed:demo &&
npm run dev`). Checks: `npm run lint`, `npm run typecheck`, `npm run test:unit`,
`npm run test:integration` (needs Postgres), `npm run test:e2e`.
