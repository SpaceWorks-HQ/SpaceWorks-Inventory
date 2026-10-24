# Configuration

[Documentation index](README.md)

Space Works Inventory reads a small set of environment variables for the
things it needs before it can reach its own database: origins, connections,
secrets and encryption keys. Everything else (email settings, the sign-up
policy, and every rule of each makerspace) is set inside the app and audited.

For development copy `.env.example` to `.env`. Production settings belong in
an external mode-600 configuration directory or a secret manager. The VPS
installer generates them; use its settings menu rather than replacing secrets.
`lib/env.ts` validates them when a production server starts (it refuses to
start with a problem), and `npm run production:check`
(`scripts/check-production-env.mjs`) runs the same checks, printing names and
rules but never values.

## Origins, services and secrets

`AUTH_URL` and `NEXT_PUBLIC_BASE_URL` must be the same canonical HTTPS website
origin. PostgreSQL requires TLS (`sslmode=require`, `verify-ca` or
`verify-full`); a transaction-pooler URL on port 6543 requires
`pgbouncer=true` and a separate direct or session `DIRECT_URL` for migrations.
Redis requires `rediss://`. A custom storage endpoint requires HTTPS and a
private bucket. Set both storage credential fields or neither when using a
workload role.

Generate each key independently: `openssl rand -base64 32` for the three
encryption keys, and at least 32 random characters (`openssl rand -hex 32`) for
`AUTH_SECRET`, `CRON_SECRET` and `HEALTHCHECK_SECRET`. Back up
`MFA_ENCRYPTION_KEY` and `INTEGRATION_ENCRYPTION_KEY` with the database: losing
them makes authenticator seeds and the saved Razorpay, Stripe and webhook
signing secrets unreadable. The Server Actions key stays stable per runtime;
backend and frontend use independent keys. The database stores only hashes of
bearer capabilities (invitations, sign-in links, password resets, API keys).

`TRUSTED_PROXY_IP_HEADER` must name a header that your edge **overwrites** with
the client address: Caddy overwrites `x-real-ip`; Render and DigitalOcean
append to `x-forwarded-for` (use `TRUSTED_PROXY_HOPS=1`); use
`cf-connecting-ip` only behind your own Cloudflare zone. Rate limits and audit
records use it; without it every client shares one rate-limit bucket. The
CI-only pair `CI=true` and `ALLOW_INSECURE_PRODUCTION_TESTS=1` relaxes the TLS
rules for disposable tests and must never reach a deployment.

## Settings inside the app

These live in the database, not the environment, and every change is recorded
in the audit log with the names of the fields that changed.

**Instance admin, `/admin`** (the setup wizard's account or `SUPER_ADMIN_EMAIL`,
behind a fresh authenticator code):

- **Instance settings**: outgoing email (sender, SMTP host, port, TLS, login,
  password or a Nodemailer service name) and the sign-up policy (`invite`, the
  default, hides "Create an account"; `open` shows it, and new accounts still
  join a space only by invitation or, where a space allows it, self-join).
  Saved values override `EMAIL_FROM`/`SMTP_*` and `ACCOUNT_SIGNUP`; secrets are
  encrypted and never shown again.
- **Spaces**, **Users**, **Jobs** (queue counts, failed jobs, retry, pause) and
  **Email outbox** (what was sent and why a message failed).

**Each space, `/s/<slug>/settings`** (inventory managers):

| Tab | What it holds |
| --- | --- |
| General | Name, tagline, address, contact email, time zone, currency and asset tag prefix |
| Lending policy | Lending on or off, public catalogue, self-checkout, loan lengths and limits, renewals, reminders |
| Member eligibility | Self-join, verified email, membership numbers, automatic restriction when overdue or after an incident |
| Evidence rules | Minimum handover photos (1 to 3), containers required, remarks on issue |
| Fees and deposits | Deposits, rental, late fees, damage charges, payment before issue, pay later |
| Notifications | Staff alerts on new requests, low-stock alerts, overdue escalation |
| Transfers between spaces | Accept transfers from other spaces of the install, share stock levels with them |
| Branding | Logo and how the space looks to members and visitors |
| Payments (`/settings/payments`) | Razorpay, Stripe and cash/bank (offline) payments, test mode, webhook URLs |
| Integrations (`/settings/integrations`) | API keys and outbound webhooks |
| Roles (`/settings/roles`) | The role matrix for this space |
| Danger zone | Delete the space |

**Inventory settings, `/s/<slug>/settings/inventory`** (inventory managers):
stock rules (approval for transfers between locations, label size and
contents, default reorder point, cycle-count variance threshold), count
schedules, categories, units and suppliers.

The authoritative list of space settings, their schemas and the role each one
needs is `lib/settings/sections.ts`.

## Payment providers

Payments are per space and optional: a space can lend for free, record cash or
bank payments, let members pay later, or take payments online through Razorpay
or Stripe. Secrets are write-only and encrypted with the integration key. Start
in **test mode** with the providers' test keys.

1. Open **Space settings → Payments** and save once (with the providers still
   off). The page then shows this space's two webhook URLs,
   `https://<your origin>/api/payments/razorpay/<code>` and
   `https://<your origin>/api/payments/stripe/<code>`. `<code>` is a random
   value per space, never the slug. In a split layout use the API hostname
   instead (see [Split hosting](DEPLOYMENT_SPLIT.md#current-limitations)).
2. **Razorpay**: in the Razorpay Dashboard, open **Account & Settings →
   Webhooks** (in the same mode, test or live, as your keys), choose **Add new
   webhook**, paste the Razorpay URL, set a secret and subscribe to
   `payment.captured`, `payment.failed`, `refund.processed` and
   `refund.failed`. Back in the app, enter the key id (`rzp_test_…` or
   `rzp_live_…`), the key secret and that webhook secret.
3. **Stripe**: in the Stripe Dashboard, open **Developers → Webhooks** (Workbench
   in newer dashboards), **Add endpoint**, paste the Stripe URL and select
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `refund.created`, `refund.updated` and `refund.failed`. Copy the endpoint's
   signing secret (`whsec_…`) into the app with the secret key (`sk_…` or a
   restricted `rk_…` key).
4. Use **Test connection**, turn the provider on and save. Each webhook event is
   verified against its signature and applied once; payments the webhook
   missed are reconciled by a background job every ten minutes.

## Installer settings

These belong to the [VPS installer](DEPLOYMENT_VPS.md), not the application.

| Variable | Purpose |
| --- | --- |
| `SWI_DIR` | Install root, `/opt/spaceworks-inventory` (`--dir`) |
| `SWI_CONFIG_DIR` | External secrets and configuration directory, `/etc/spaceworks-inventory` |
| `SWI_REPOSITORY` | GitHub owner/name to install from (`--repo`); defaults to `SpaceWorks-HQ/SpaceWorks-Inventory` |
| `SWI_RELEASE_TAG`, `SWI_REF` | A published release or a source reference to build (`--release`, `--ref`); choose only one |
| `SWI_GITHUB_TOKEN`, `SWI_GITHUB_USER` | Read credential for a private repository and its packages, and the account that owns it (see [the VPS guide](DEPLOYMENT_VPS.md#private-repository-and-packages)) |
| `SWI_CADDY_TLS` | `internal` (LAN or trial), `proxy` (your own reverse proxy) or unset for automatic public HTTPS; recorded in `compose.env` |
| `SWI_LAYOUT` | `split`, `single` or `netlify`, recorded in `compose.env` |
| `SWI_VERSION` | Immutable release version, recorded in `compose.env` |
| `SWI_BACKEND_IMAGE`, `SWI_FRONTEND_IMAGE` | Backend and frontend registry repositories (empty for local source builds) |
| `SWI_STORAGE` | `external`, or unset for bundled Silo |
| `PUBLIC_HOST`, `SITE_HOST`, `PUBLIC_ORIGIN` | API host, split website host and canonical website origin |
| `SWI_STATUS_DIR` | Where the app container mounts the installer's status directory (read-only) |
| `BACKUP_KEEP_DAYS`, `BACKUP_SCHEDULE`, `BACKUP_AGE_RECIPIENT`, `OFFSITE_*` | Backup settings in `backup.env` |
| `SWI_DEPLOY` | GitHub repository variable that turns on the opt-in runner deploy job |

The installer records release metadata in `install.conf` and writes separate
Compose, application (`app.env`), migration, database, storage and frontend
env files; worker and beat use `app.env`. Neither a development `.env` nor
shell variables override saved production settings. Internal TLS private keys
stay outside runtime mounts.

## Split rendering

`BACKEND_ORIGIN`, `NEXT_PUBLIC_BACKEND_ORIGIN`, `FRONTEND_GATEWAY_SECRET` and
`FRONTEND_TRUSTED_IP_HEADER` configure the separate frontend. The website and
backend origins must differ; `NEXT_PUBLIC_BACKEND_ORIGIN` must equal
`BACKEND_ORIGIN`. The gateway key is 32 random bytes encoded as 64 hex
characters. Set `DEPLOYMENT_MODE=backend` and the same `FRONTEND_GATEWAY_SECRET`
on the API runtime. Frontend trusted IP headers are `x-nf-client-connection-ip`
on Netlify or `x-real-ip` behind Caddy. See
[Split hosting](DEPLOYMENT_SPLIT.md) for its current limitations.

Public variables compile into the UI. Release containers replace known
public-origin placeholders at start; a custom build needs rebuilding when its
public origins change. `ALLOWED_ACTION_ORIGINS` is build-time only; release
images refuse to start when it is set.

## Application environment reference

Every variable in `lib/env.ts` and `.env.example`. **Production** marks the
variables a production server refuses to start without (`REQUIRED_IN_PRODUCTION`,
plus `DATABASE_URL` and `AUTH_SECRET`, which every environment needs).
Development defaults are the values in `.env.example`.

### Database

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://swi:swi_dev_password@localhost:5440/swi_dev` (local) | **Production.** Runtime PostgreSQL 16 connection. TLS in production; port 6543 poolers need `pgbouncer=true` |
| `DIRECT_URL` | `DATABASE_URL` | Direct or session connection for migrations; set it when `DATABASE_URL` goes through a transaction pooler |
| `TEST_DATABASE_URL` | `postgresql://swi:swi_dev_password@localhost:5440/swi_test` (local) | Disposable database for `npm run db:test:prepare` and `npm run test:integration`; its test data is wiped. Never production |

### Sign-in and origins

| Variable | Default | Meaning |
| --- | --- | --- |
| `AUTH_SECRET` | none | **Production.** Auth.js session signing secret, at least 32 characters |
| `AUTH_URL` | `http://localhost:3000` (local) | **Production.** Public origin, no trailing slash; identical to `NEXT_PUBLIC_BASE_URL`, HTTPS in production |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3000` (local) | **Production.** The website origin used in emails, QR labels (`/q/<code>`) and payment webhook URLs |
| `SUPER_ADMIN_EMAIL` | unset | This account can also open `/admin` (the setup wizard's account always can); the VPS super-admin recovery acts only on it |
| `ACCOUNT_SIGNUP` | `invite` | `open` shows "Create an account" on the sign-in page; `invite` hides it. `/admin` overrides it |

### Encryption keys and operational secrets

| Variable | Default | Meaning |
| --- | --- | --- |
| `MFA_ENCRYPTION_KEY` | none | **Production.** Base64 of 32 bytes. Encrypts authenticator seeds and, without the next key, the integration secrets |
| `INTEGRATION_ENCRYPTION_KEY` | a subkey of `MFA_ENCRYPTION_KEY` | Base64 of 32 bytes. Encrypts payment provider secrets and webhook signing secrets |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | none | **Production.** Base64 of 16, 24 or 32 bytes. Stable across builds, replicas and restarts; release images refuse to start without it |
| `CRON_SECRET` | none | **Production.** Bearer for `POST /api/internal/outbox` and `/api/internal/jobs`, at least 32 characters |
| `HEALTHCHECK_SECRET` | none | **Production.** Bearer for `GET /api/health/db`, at least 32 characters |

### Background jobs

| Variable | Default | Meaning |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6395` (local) | **Production.** Redis for rate limits and the BullMQ queues; `rediss://` in production. Without it in development, rate limits use memory |
| `JOBS_INPROCESS` | `false` | `true` runs the jobs in the web process when there is no Redis. Development only; production refuses it |
| `JOBS_HEALTH_PORT` | `3460` | Private health port of the worker and beat (`GET /health`) |
| `JOBS_QUEUE_PREFIX` | `swi:jobs` | Redis key prefix for the queues; the same on every role. Do not change it on a running installation |
| `QUEUE_OUTBOX_CONCURRENCY` | `5` | Parallel email and webhook deliveries per worker (1–64) |
| `QUEUE_SCHEDULED_CONCURRENCY` | `2` | Parallel periodic jobs per worker (1–64) |
| `OUTBOX_RETENTION_DAYS` | `30` | Days to keep sent and failed outbox rows and finished webhook deliveries (1–365). Expired tokens and sessions are removed daily regardless |

### Photo storage

| Variable | Default | Meaning |
| --- | --- | --- |
| `S3_BUCKET` | `swi-dev` (local) | **Production.** Private bucket for item photos and evidence. Without `S3_BUCKET` and `S3_REGION` in development, files go to `.data/storage` |
| `S3_REGION` | `us-east-1` (local) | **Production.** Bucket region; `auto` for Cloudflare R2 |
| `S3_ENDPOINT` | AWS S3 | S3-compatible endpoint origin (Silo, R2, Spaces); HTTPS in production |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | unset | Bucket credentials; set both, or neither to use a workload role |
| `S3_FORCE_PATH_STYLE` | `0` | `1` for path-style addressing (Silo, R2, Spaces) |
| `UPLOAD_MAX_BYTES` | `26214400` (25 MiB) | Largest accepted upload. Server Actions accept bodies up to 26 MB, so larger values have no effect on forms |

### Email

| Variable | Default | Meaning |
| --- | --- | --- |
| `EMAIL_FROM` | unset | Sender, `Name <address@verified-domain>`; required when SMTP is configured |
| `SMTP_HOST` | unset | Relay host. Without SMTP in development, messages are written to `.data/mail/` |
| `SMTP_PORT` | unset | Relay port: 587 or 2525 (STARTTLS), 465 (implicit TLS) |
| `SMTP_SECURE` | `false` | `true` for implicit TLS (port 465). In production, `false` still requires STARTTLS |
| `SMTP_SERVICE` | unset | A Nodemailer well-known service name instead of host and port |
| `SMTP_USER`, `SMTP_PASSWORD` | unset | Relay login; required with `SMTP_HOST` unless `SMTP_ALLOW_UNAUTHENTICATED=1` |
| `SMTP_ALLOW_UNAUTHENTICATED` | `0` | `1` for local Mailpit only (`SMTP_HOST=localhost SMTP_PORT=1025`) |

These are the bootstrap fallback: values saved under `/admin` → Instance
settings override them.

### Webhooks, proxies and builds

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOW_PRIVATE_WEBHOOK_TARGETS` | `false` | `true` lets outbound webhooks reach private network addresses (development and trusted LANs only) |
| `TRUSTED_PROXY_IP_HEADER` | unset | **Production.** `x-real-ip`, `x-forwarded-for` or `cf-connecting-ip`: the header your edge overwrites with the client IP |
| `TRUSTED_PROXY_HOPS` | unset (left-most entry) | With `x-forwarded-for` only: the number of trusted appending proxies, counted from the right |
| `ALLOWED_ACTION_ORIGINS` | unset (same origin) | Comma-separated extra origins allowed to call Server Actions; build time only |
| `ALLOW_INSECURE_PRODUCTION_TESTS` | unset | `1`, together with `CI=true`, relaxes TLS rules in disposable CI tests only |

### Split hosting

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEPLOYMENT_MODE` | unset | `backend` on the API runtime of a split layout: it then serves only `/api/*` and the gateway |
| `BACKEND_ORIGIN` | unset | Frontend: the backend's HTTPS origin. Backend: its own origin |
| `NEXT_PUBLIC_BACKEND_ORIGIN` | unset | Frontend: equal to `BACKEND_ORIGIN` |
| `FRONTEND_GATEWAY_SECRET` | unset | 64 hex characters shared by frontend and backend; required with `DEPLOYMENT_MODE=backend` |
| `FRONTEND_TRUSTED_IP_HEADER` | unset | Frontend only: `x-nf-client-connection-ip` (Netlify) or `x-real-ip` (Caddy) |

### Demo data

| Variable | Default | Meaning |
| --- | --- | --- |
| `DEMO_PASSWORD` | unset | Password (12 or more characters) for the demo accounts that `npm run db:seed:demo` creates. Never on production |

### Container runtime

These are read by the images rather than the application:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MIGRATE_ON_START` | `0` | `1` makes the web container apply pending migrations (through `DIRECT_URL`) before it starts, for platforms without a release job. Use a one-shot `migrate` with several replicas |
| `NODE_EXTRA_CA_CERTS` | unset | Extra CA for internal TLS (the VPS sets it to its private CA) |
| `NODE_OPTIONS` | unset | For example `--max-old-space-size=384` on a 512 MB instance |
| `PORT`, `HOSTNAME` | `3000`, `0.0.0.0` | Web server listen address |

## Background work

Run `node dist/worker.js` and `node dist/beat.js` from the backend image with
the runtime configuration and the same persistent Redis. Redis must use
`noeviction`. Keep exactly one beat per installation. `APP_URL` and
`CRON_SECRET` are the only inputs of the HTTP cron clients
(`scripts/scheduler.mjs` and the Cloudflare cron Worker); both internal POST
endpoints only enqueue work, so they need a live worker. Cron can replace beat;
it cannot replace the worker. See
[Production operations](production-operations.md#background-work).
