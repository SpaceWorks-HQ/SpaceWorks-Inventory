# Testing

[Documentation index](README.md)

| Suite | Command | What it covers |
| --- | --- | --- |
| Lint | `npm run lint` | ESLint (Next.js rules, 300-line limit) |
| Types | `npm run typecheck` | `next typegen` + `tsc --noEmit` |
| Unit | `npm run test:unit` | Pure rules: roles, fees, transfer and loan policy, QR codes, importer parsing, label layout, signatures, environment checks, installer scripts, design guards, page guards |
| Integration | `npm run db:test:prepare && npm run test:integration` | The domain modules against PostgreSQL: availability (including concurrency), loans, transfers, counts, purchases, payments and webhooks, import, labels, reports, API, settings |
| End to end | `npm run test:e2e` | Playwright against `npm run dev`: setup, sign-in, catalogue, lending desk, transfers, counts, settings in light and dark mode |
| Hosting | `npm run test:e2e:split`, `npm run test:e2e:vps` | Production builds of the two images, as CI does |
| Deployment | `npm run deployment:check` | Shell and Node syntax, shellcheck, YAML manifests |

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
