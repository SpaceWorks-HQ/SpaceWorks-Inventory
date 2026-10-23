# Cloud deployment

[Documentation index](README.md) · [Configuration](CONFIGURATION.md)

The cloud layout runs a web service, a BullMQ worker and beat from the backend
image, with managed data services. Render background workers need paid
compute; on a free web plan the web service does the background work itself,
woken every minute by a Cloudflare cron Worker (see [Free plan](#free-plan)). A VPS can instead run the
complete stack through the [installer](DEPLOYMENT_VPS.md).

| Piece | Provider | Settings |
| --- | --- | --- |
| Application (web, worker, beat) | Render | `render.yaml`, root `Dockerfile` |
| PostgreSQL 16 | Supabase (or Render Postgres) | `DATABASE_URL`, `DIRECT_URL` |
| Native TLS Redis | Upstash | `REDIS_URL` |
| Private photo storage | Cloudflare R2 | `S3_*` |
| Transactional email | Brevo or another SMTP relay | `SMTP_*`, `EMAIL_FROM` |
| Optional beat replacement and wake-up | Cloudflare Worker | `deploy/cloudflare-cron/` |
| Card and UPI payments (optional) | Razorpay, Stripe | per space, inside the app |

## One-click deploy on Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory)

The button opens Render's Blueprint flow for
`https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory` and reads `render.yaml`
from the default branch. **While the repository is private**, Render can only
read it through GitHub: in Render, connect your GitHub account (**Account
settings → Git providers**) and grant the Render GitHub app access to the
`SpaceWorks-HQ/SpaceWorks-Inventory` repository (or to your fork), then use
**New → Blueprint** and pick the repository. The button alone fails for a
repository Render cannot see.

Prepare the services in steps 1 to 4 first, so you can paste their values when
the Blueprint asks.

## 1. Database and Redis

Create a Supabase project in the region nearest your Render region (the
Blueprint uses `singapore`; Render's region cannot change after creation). Use
the connection strings Supabase shows under **Connect**:

- `DATABASE_URL`: the **transaction pooler** (port 6543) with
  `?pgbouncer=true&connection_limit=5&sslmode=require`.
- `DIRECT_URL`: the **session pooler** (port 5432) with `?sslmode=require`,
  used only for migrations.

URL-encode special characters in the password. Render Postgres works too:
paste its *External Database URL* with `?sslmode=require` into both.

Create an Upstash Redis database in the same region and copy its native
`rediss://default:<password>@<host>.upstash.io:6379` URL, not the REST
endpoint. Keep TLS on and eviction off (`noeviction`): the job queue and rate
limits live there. BullMQ workers poll Redis continuously, so check the plan's
command and connection quotas before choosing a free or pay-per-request tier.

## 2. Private storage and email

Create a private R2 bucket (public access off) and an **Object Read & Write**
API token scoped to that bucket. Use the S3 endpoint origin without the bucket
path (`https://<account-id>.r2.cloudflarestorage.com`), `S3_REGION=auto` and
`S3_FORCE_PATH_STYLE=1`. Photos pass through the app's access checks; browsers
need no public bucket or bucket CORS.

Authenticate your sending domain in Brevo (SPF, DKIM and DMARC records), then
create an SMTP key under **SMTP & API**. Brevo's SMTP login (an address such as
`…@smtp-brevo.com`) is `SMTP_USER` and the SMTP key is `SMTP_PASSWORD`. The
Blueprint presets `smtp-relay.brevo.com`, port 2525 and `SMTP_SECURE=false`
(STARTTLS): Render's free plan blocks outbound ports 25, 465 and 587 (see
[Render's free-service limits](https://render.com/docs/free)). Keep these
bootstrap settings even if `/admin` later overrides them; they are the
recovery path when the saved settings break.

## 3. Independent secrets

The Blueprint generates `AUTH_SECRET`, `CRON_SECRET` and `HEALTHCHECK_SECRET`.
Generate three independent keys yourself with `openssl rand -base64 32`: the
Server Actions key, the MFA key and the integration key. Keep encrypted
off-server copies. Changing the Server Actions key invalidates open forms;
losing the MFA or integration key makes authenticator seeds or the saved
Razorpay, Stripe and webhook signing secrets unreadable. Never share these with
preview deploys.

## 4. Render Blueprint

`render.yaml` defines three services that build the root `Dockerfile` (its last
target is the backend):

- `spaceworks-inventory`, the web service: `node server.js` on port 3000,
  health check `/api/health`, and `docker-entrypoint.sh migrate` as the
  pre-deploy command, so migrations run once per deploy before the new version
  takes traffic;
- `spaceworks-inventory-worker`: `node dist/worker.js`;
- `spaceworks-inventory-beat`: `node dist/beat.js`.

Worker and beat copy every setting from the web service (`fromService`), so you
enter each value once. Render asks for every `sync: false` value when the
Blueprint is created; change them later in the web service's **Environment**
tab and redeploy all three services.

| Asked for | What to enter |
| --- | --- |
| `NEXT_PUBLIC_BASE_URL` | The public HTTPS origin, no trailing slash: your custom domain, or `https://<service-name>.onrender.com` until you add one |
| `AUTH_URL` | Exactly the same value as `NEXT_PUBLIC_BASE_URL` |
| `SUPER_ADMIN_EMAIL` | The instance admin's email; use the same address in the setup wizard |
| `DATABASE_URL` | Supabase transaction pooler URL (step 1) |
| `DIRECT_URL` | Supabase session pooler URL (step 1) |
| `REDIS_URL` | Upstash `rediss://` URL (step 1) |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32` (step 3) |
| `MFA_ENCRYPTION_KEY` | `openssl rand -base64 32` (step 3) |
| `INTEGRATION_ENCRYPTION_KEY` | `openssl rand -base64 32` (step 3) |
| `S3_BUCKET` | The R2 bucket name |
| `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The R2 API token's S3 credentials |
| `EMAIL_FROM` | `Space Works Inventory <inventory@your-verified-domain>` |
| `SMTP_USER`, `SMTP_PASSWORD` | Brevo SMTP login and SMTP key (step 2) |

Values the Blueprint sets for you: `NODE_OPTIONS` (sized for a 512 MB
instance), `TRUSTED_PROXY_IP_HEADER=x-forwarded-for` with
`TRUSTED_PROXY_HOPS=1` (Render appends the client address), `S3_REGION=auto`,
`S3_FORCE_PATH_STYLE=1` and the Brevo host, port and `SMTP_SECURE`. Use
`cf-connecting-ip` (and remove the hops) only when your own Cloudflare zone
proxies the domain and the `onrender.com` hostname is not otherwise used. See
[Configuration](CONFIGURATION.md) for every variable.

Render passes service environment variables to `docker build` as build
arguments. The image compiles `NEXT_PUBLIC_BASE_URL` and the Server Actions key
in from them (the key stays in the builder stage, never in the final image), so
**redeploy after changing either**. Prefer a Render secret file named
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` where you can; the Dockerfile reads it as
a BuildKit secret first. See [Render's Docker docs](https://render.com/docs/docker).

The worker has a 300-second shutdown delay, Render's maximum. Keep beat at one
instance. Health servers listen privately on port 3460; background workers
receive no public HTTP endpoint. Use `/admin/jobs` and `/admin/outbox` to
monitor them. See Render's [background workers](https://render.com/docs/background-workers)
and [Blueprint reference](https://render.com/docs/blueprint-spec).

## 5. Domain

Add the custom domain to the web service, follow Render's DNS instructions and
wait for the certificate. Then set `NEXT_PUBLIC_BASE_URL` and `AUTH_URL` to the
new origin and redeploy. Do this **before printing QR labels**: every label
encodes `<NEXT_PUBLIC_BASE_URL>/q/<code>`, and a phone's camera app opens that
address. Disable CDN HTML rewriting or injected scripts; they break the nonce
content security policy.

## 6. First setup and acceptance

Open `/setup`. The wizard creates the instance admin account (use
`SUPER_ADMIN_EMAIL`) and your first makerspace, then continues with the space
setup. Enable two-step verification under **Account** and open `/admin` with a
fresh code; check the email settings and sign-up policy there. Then work through
the [acceptance checklist](production-operations.md#acceptance-checklist),
including the payment providers if the space charges for loans (see
[Payment providers](CONFIGURATION.md#payment-providers)). Check authenticated
readiness with `HEALTHCHECK_SECRET` in an `Authorization: Bearer` header, never
in the URL.

Free plans do not replace backups or point-in-time recovery. Enable your
database provider's backups, take regular `npm run db:backup` archives over the
direct connection, copy R2 objects and the encryption keys off the provider,
and test restores. See [Production operations](production-operations.md).

## Free plan

A free Render web service sleeps after a period without traffic, cannot run
background workers or a pre-deploy command, and blocks the usual SMTP ports.
To run on it:

1. In your copy of `render.yaml` (a fork or branch connected to Render), set
   the web service's `plan: free`, delete the `spaceworks-inventory-worker` and
   `spaceworks-inventory-beat` services, delete `preDeployCommand` and add

   ```yaml
   - key: MIGRATE_ON_START
     value: "1"
   ```

   `scripts/docker-entrypoint.sh` then applies pending migrations (through
   `DIRECT_URL`) before the web server starts, and refuses to start if they
   fail.
2. Keep Redis: production refuses to start without `REDIS_URL`.
3. Deploy the [Cloudflare cron Worker](../deploy/cloudflare-cron/README.md)
   from `deploy/cloudflare-cron` with two secrets: `APP_URL` (the public HTTPS
   origin) and `CRON_SECRET` (copy the value Render generated). Every minute it
   calls `GET /api/health` to wake the instance, then
   `POST /api/internal/outbox?run=inline` with `Authorization: Bearer
   <CRON_SECRET>`. With `run=inline` the web service itself delivers queued
   email (sign-in links, invitations, receipts) and webhooks, sends loan
   reminders and escalations, opens scheduled counts, reconciles pending
   payments and runs the retention purge, once per call. It replaces both the
   worker and beat, and its database query every minute also keeps a free
   Supabase project from pausing. A free Render instance kept awake all month
   uses most of the free instance hours; check the current allowance.

Email and reminders then go out within about a minute instead of seconds.
Production still refuses `JOBS_INPROCESS=true` (an always-on loop inside the
web process); the cron call is the supported free-plan path. When you later
add a paid worker and beat, set the cron Worker's `INLINE=false` (it then only
queues work) or remove it; running inline calls next to a worker is safe but
unnecessary.

## DigitalOcean App Platform

[`.do/app.yaml`](../.do/app.yaml) runs the published backend image from GitHub
Packages: the `web` service, a `migrate` PRE_DEPLOY job (a failed migration
stops the rollout) and the `worker` and `beat` workers, all on one release.

1. Create a managed PostgreSQL 16 cluster named `swi-db` (database `swi`, user
   `swi`) in the app's region; the spec binds it as `${db.DATABASE_URL}`, which
   carries `sslmode=require`. Set `DIRECT_URL` to the same direct connection
   (or the cluster's direct URL if you put a pool in front).
2. Create a managed Valkey (Redis-compatible) cluster and copy its `rediss://`
   URI into `REDIS_URL`.
3. Create a private Spaces bucket and a Spaces access key limited to it; set
   `S3_BUCKET`, `S3_REGION` and `S3_ENDPOINT` to match its region.
4. Replace every `CHANGE_ME` and each `REPLACE_WITH_IMMUTABLE_RELEASE` with one
   release version such as `0.1.0-main.42.a1b2c3d4e5f6` (see
   [Releases](CONTAINER_IMAGES.md#versions-and-releases)). While the packages
   are private, add `registry_credentials: "<github-user>:<classic token with read:packages>"`
   to each `image` block.
5. Create the app with `doctl apps create --spec .do/app.yaml`, then set the
   `SECRET` values in the control panel (or `doctl apps update`): never commit
   them. Use `openssl rand -base64 33` for `AUTH_SECRET`, `CRON_SECRET` and
   `HEALTHCHECK_SECRET`, and `openssl rand -base64 32` for the three keys.

Release images start with placeholder origins that the entrypoint replaces with
`NEXT_PUBLIC_BASE_URL`, and refuse to start without
`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (see
[Container images](CONTAINER_IMAGES.md#the-images-serve-every-installation)).
App Platform's edge appends the client address, so keep
`TRUSTED_PROXY_IP_HEADER=x-forwarded-for` with `TRUSTED_PROXY_HOPS=1`. Update by
changing the tag in all four places and running `doctl apps update <app-id> --spec .do/app.yaml`.

## Other hosts

Any host that runs containers can follow
[Production Docker deployment](DEPLOYMENT_DOCKER.md). A separately hosted
website follows [Split hosting](DEPLOYMENT_SPLIT.md) and Netlify's
[monorepo settings](https://docs.netlify.com/build/configure-builds/monorepos/).
