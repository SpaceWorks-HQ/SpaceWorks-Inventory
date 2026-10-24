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
   and their invitations were migrated to inventory managers. See
   [Roles](RBAC.md).
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
7. **Version.** This work is 0.2.0; 0.1.0 was never released.
8. **No pauses.** The build continues without waiting for owner decisions;
   commits stay local on `dev` until the owner's QA.

## Defaults the owner may revisit

| Decision | Why |
| --- | --- |
| A space created under `/admin` for someone without an account makes the instance admin its interim manager and invites the named person as manager | A space must always have an active manager; the admin can leave once the invitee joins |
| Self-checkout switched off explains why (and links to the catalogue) instead of answering not-found | Members otherwise think the QR code is broken; it reveals nothing beyond the space's public setting |
| No route-level `loading.tsx` inside spaces | Streaming commits a 200 before a page can refuse, so foreign and unknown records would stop answering 404 |
| Desk scanners preload up to 500 tags and 300 containers, and ask the server for anything else | Keeps the first paint small in large spaces without capping what can be scanned |
| The production harness (`test:e2e:vps` and `test:e2e:split` with `--external-services --demo`, in Linux) is the authoritative browser gate; the Windows dev-server run is secondary | Fast Refresh on Windows can reload pages mid-test; every e2e spec still runs in at least one mode |
| In dark mode the 404 pet sits on a cream chip | The brand pet art is drawn for light backgrounds |
| Easter eggs and the colour-mode reveal are off under reduced motion | Accessibility first; they are decoration |

## Owner checks (cannot be run from a development machine)

| Check | Accepted when |
| --- | --- |
| A real Render deploy from `render.yaml` (Deploy to Render button) | The Blueprint creates every service; web, worker and beat report healthy; sign-in and the setup wizard work; an uploaded photo survives a redeploy |
| A real VPS install, release path and `--ref dev` | A fresh Ubuntu server installs, the menu's check passes, update, backup and restore work, and HTTPS is issued |
| GHCR publish and release install | The first release from `main` publishes both images and the installer pulls them instead of building |
| Live Razorpay and Stripe test-mode payments | One paid and refunded loan per gateway in test mode, with webhooks applied once |
