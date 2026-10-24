# Production Docker deployment

[Documentation index](README.md) · [VPS installer](DEPLOYMENT_VPS.md) · [Images](CONTAINER_IMAGES.md)

For a complete server use the VPS installer. This guide runs the backend image
with separately supplied PostgreSQL 16, Redis, S3-compatible storage and SMTP,
on any Docker host or orchestrator. Terminate HTTPS at a trusted proxy; publish
only a private container port.

## Images and runtime

Pull an immutable `ghcr.io/spaceworks-hq/spaceworks-inventory-backend:<release>`
(while the packages are private, `docker login ghcr.io` first with a classic
token that has `read:packages`). It serves the whole application by default.
Run `migrate` once before the web rollout using an administration connection.
Runtime connections should have only data privileges. Use TLS for PostgreSQL,
Redis and custom S3 endpoints.

```bash
export SWI_VERSION=0.1.0-main.42.a1b2c3d4e5f6
image="ghcr.io/spaceworks-hq/spaceworks-inventory-backend:$SWI_VERSION"
docker pull "$image"
docker run --rm --env-file /secure/swi-migration.env "$image" migrate
docker run -d --name spaceworks-inventory --restart unless-stopped \
  --env-file /secure/swi-runtime.env -p 127.0.0.1:3000:3000 "$image"
docker run -d --name spaceworks-inventory-worker --restart unless-stopped \
  --stop-timeout 600 --env-file /secure/swi-runtime.env "$image" node dist/worker.js
docker run -d --name spaceworks-inventory-beat --restart unless-stopped \
  --env-file /secure/swi-runtime.env "$image" node dist/beat.js
```

Environment files stay outside Git, mode 600. Configure every production
variable in [Configuration](CONFIGURATION.md), including independent MFA and
integration keys, and check the file before starting with
`docker run --rm --env-file /secure/swi-runtime.env "$image" node scripts/check-production-env.mjs`.
The web container refuses to start with an invalid production environment. The
container runs as uid 1001; operator tools run as root only when needed. Only
public CA certificates enter runtime mounts.

The proxy must overwrite the configured client-IP header
(`TRUSTED_PROXY_IP_HEADER`), preserve `Host` and forward the HTTPS protocol.
Allow request bodies of at least 30 MB (photo uploads and spreadsheet imports
go up to `UPLOAD_MAX_BYTES`, 25 MB by default) and do not buffer responses.
Keep data and storage administration ports private. Phones scan QR codes with
their camera only on an HTTPS origin.

## Building your own image

```bash
docker build --target runner \
  --build-arg NEXT_PUBLIC_BASE_URL=https://spaceworks-inventory-origin.invalid \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
  -t spaceworks-inventory-backend:reviewed .
```

With the placeholder origin above, the image behaves like a release image: the
entrypoint applies `NEXT_PUBLIC_BASE_URL` at start. Pass your real origin
instead to compile it in. The frontend target additionally takes
`NEXT_PUBLIC_BACKEND_ORIGIN`. CI builds both architectures; the Dockerfile's
last target is the backend for providers that cannot choose a target.
`ALLOWED_ACTION_ORIGINS` is compiled in at build time, so set it here if a
trusted proxy on another hostname must invoke Server Actions. Builders without
BuildKit secrets may use the identically named build argument; it remains in
the builder metadata and cache, so prefer secret mounts.

## Migrations, health and jobs

`DIRECT_URL` defaults to `DATABASE_URL`; use a direct or session connection when
the runtime uses a transaction pooler. `MIGRATE_ON_START=1` applies migrations
before the web server starts on platforms without release jobs; use a one-shot
`migrate` instead with more than one replica. A failed migration blocks
startup.

`GET /api/health` is public liveness and never touches the database or Redis.
`GET /api/health/db` requires `Authorization: Bearer $HEALTHCHECK_SECRET` and
answers a plain 404 otherwise. Run separate worker and beat containers from
the same backend image and release, `node dist/worker.js` and
`node dist/beat.js`, with the backend runtime environment and the same
persistent Redis. Do not publish port 3460 (`JOBS_HEALTH_PORT`); probe
`/health` on it privately. Give the worker up to ten minutes to drain on
SIGTERM. Run exactly one beat.

If an external cron replaces beat, call `POST /api/internal/outbox` and
`POST /api/internal/jobs` every minute with
`Authorization: Bearer $CRON_SECRET`. `node scripts/scheduler.mjs --once`
(inputs: `APP_URL` and `CRON_SECRET`) provides that tick. Both endpoints only
enqueue and return 503 when Redis is unavailable; keep the worker running.

Back up the database, photos and encryption keys before changing releases.
Retain the previous image until checks pass. Application rollback does not
reverse migrations. The backend contains operator tools and the Prisma CLI;
`npm run db:backup` needs PostgreSQL client tools in a trusted checkout. Never
seed demo data on production. After the first deploy, work through the
[acceptance checklist](production-operations.md#acceptance-checklist).
