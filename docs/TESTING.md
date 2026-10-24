# Testing

[Documentation index](README.md)

| Suite | Command | What it covers |
| --- | --- | --- |
| Lint | `npm run lint` | ESLint (Next.js rules, 300-line limit) |
| Types | `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| Unit | `npm run test:unit` | Pure rules: roles, fees, transfer and loan policy, QR codes, importer parsing, label layout, signatures, environment checks, installer scripts, design guards, page guards |
| Integration | `npm run db:test:prepare && npm run test:integration` | The domain modules against PostgreSQL: availability (including concurrency), loans, transfers, counts, purchases, payments and webhooks, import, labels, reports, API, settings |
| End to end | `npm run test:e2e` | Playwright against `npm run dev`: setup, sign-in, catalogue, lending desk, transfers, counts, settings in light and dark mode |
| Hosting | `npm run test:e2e:split`, `npm run test:e2e:vps` | Production builds as in CI; opt into seeded signed-in journeys with `--external-services --demo` |
| Deployment | `npm run deployment:check` | Shell and Node syntax, shellcheck, YAML manifests |

For signed-in hosting journeys, use disposable external PostgreSQL, Redis and
S3-compatible storage: `DATABASE_URL=... REDIS_URL=... S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... npm run test:e2e:vps -- --external-services --demo`
(or `test:e2e:split`). `--demo` requires `--external-services`, seeds the demo
after migrations with a fresh random password, and passes that password to
Playwright. `S3_REGION` defaults to `us-east-1`; `S3_FORCE_PATH_STYLE` is passed
through (set it to `1` for path-style storage). The magic-link email test skips
because the harness uses SMTP rather than `.data/mail`. Without `--demo`, the
CI behaviour is unchanged.

## Integration database

Integration tests need a disposable PostgreSQL database in
`TEST_DATABASE_URL` (never your development database). `npm run
db:test:prepare` applies the migrations. Each test file creates its own
spaces and users with a random suffix (`tests/helpers/fixtures.ts`) and
removes them afterwards, so files can run in any order.

Workflow tests call the domain modules directly inside
`prisma.$transaction`, exactly as the Server Actions and API routes do.
Payment providers are never called: tests stub `fetch` and sign webhook
bodies with test secrets.

## What to run when

- Any change: lint, types, unit tests.
- Data, permissions, workflows, payments: integration tests too.
- Pages and flows: `npm run test:e2e` and a look in both colour modes.
- Deployment files: `npm run deployment:check` and the hosting suites in CI.
