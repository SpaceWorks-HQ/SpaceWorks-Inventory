# Contributing to Space Works Inventory

Thank you for helping. Space Works Inventory is licensed AGPL-3.0-or-later;
by contributing you agree that your contribution is licensed the same way.

Read [AGENTS.md](AGENTS.md) first: it is the project guide for people and
coding agents alike (product, repository map, invariants, conventions).
Report security problems privately as described in [SECURITY.md](SECURITY.md),
never in an issue or pull request.

## Getting started

```bash
cp .env.example .env          # names only; fill in local values
npm ci
docker compose up -d --wait   # PostgreSQL, Redis, Silo storage and Mailpit, local only
npm run db:migrate
npm run dev
```

Open `http://localhost:3000/setup` to create the first account and space. For
a populated install, `DEMO_PASSWORD=<12+ characters> npm run db:seed:demo`.
Mailpit shows outgoing email at `http://localhost:8025` (set
`SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_ALLOW_UNAUTHENTICATED=1`);
without SMTP, emails are written to `.data/mail/`. Never read, print or commit
`.env`.

## Branches

- `main` is production. Only @Shaan-Shoukath merges into it; never push to it.
- `dev` is the integration branch. Open pull requests against `dev`.
- Work on a short-lived branch from `dev`: `feat/<topic>` for features,
  `fix/<topic>` for bug fixes (`docs/`, `chore/` and `test/` are fine too).
- Releases happen by bumping `VERSION` on `dev` and merging into `main`; see
  [Releases](docs/CONTAINER_IMAGES.md#versions-and-releases).

## Checks to run

From [docs/TESTING.md](docs/TESTING.md):

| Change | Run |
| --- | --- |
| Anything | `npm run lint`, `npm run typecheck`, `npm run test:unit` |
| Data, permissions, workflows, payments | also `npm run db:test:prepare && npm run test:integration` (a disposable `TEST_DATABASE_URL`, never your development database) |
| Pages and flows | also `npm run test:e2e`, and a look in both light and dark mode |
| Deployment files | also `npm run deployment:check` (needs `shellcheck`); CI runs the hosting suites |
| Before you push | `npm run build` |

After adding or changing pages or Server Actions, run `npm run frontend:catalog`
and commit the regenerated files.

## Rules that reviews enforce

- **Invariants.** Never weaken a rule in [docs/INVARIANTS.md](docs/INVARIANTS.md).
  Stock balances change only in `lib/inventory/availability`; loan, transfer
  and count status only in their workflow modules; every query on tenant data
  filters by `spaceId` after a membership check. If a rule must change, change
  the document in the same pull request.
- **Permissions.** Pages call `requireSpace(slug, minRole)` themselves; Server
  Actions start with `spaceAction(slug, capability)`. Update `lib/roles.ts` and
  [docs/RBAC.md](docs/RBAC.md) together.
- **Settings, not constants.** New policy goes into `lib/settings/sections.ts`
  with the role that may change it.
- **300-line rule.** Every hand-written file (source, tests, scripts, CSS) stays
  at or under 300 lines; ESLint's `max-lines` enforces it. Split by
  responsibility behind an `index.ts`. Generated files are exempt.
- **Design system.** Follow [docs/DESIGN.md](docs/DESIGN.md) (source of truth:
  [SpaceWorks-Design](https://spaceworks-hq.github.io/SpaceWorks-Design/)).
  Colours come only from tokens, never hard-coded hex; Gilroy everywhere, with
  Unbounded for one accent phrase on auth and empty-state heroes; light and
  dark mode for everything; status pills always carry a word.
  `tests/unit/design-fidelity.test.ts` checks the basics.
- **Copy.** Errors are short sentences that say what happened and what to do.
  Write "Space Works" in copy and `SpaceWorks` only in identifiers. en-GB
  spelling, sentence-case headings, no emoji.
- **Money and dates.** Integer minor units through `lib/format/money.ts`;
  dates through `lib/format/datetime.ts` in the space time zone.
- **Agent guide.** `CLAUDE.md` is a byte-identical copy of `AGENTS.md`. Edit
  `AGENTS.md`, then copy it over `CLAUDE.md`.

## Commits and pull requests

Commit in small logical steps with conventional messages and explicit paths:

```text
feat(loans): renewals respect the space's maximum
fix(transfers): refuse receipt of more than was dispatched
test(counts): stale lines after a concurrent adjustment
docs: deployment guides for this app
chore(seed): demo makerspaces through the real workflows
```

The scope is the area you changed (`loans`, `transfers`, `counts`, `catalogue`,
`payments`, `settings`, `vps`…). Describe in the pull request what changed,
why, how you tested it, and screenshots in both colour modes for UI changes.
Add user-visible changes to [CHANGELOG.md](CHANGELOG.md) under *Unreleased*.
CI must pass before review.
