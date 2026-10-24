# Space Works Inventory cron Worker

A Cloudflare Worker with a Cron Trigger (`* * * * *`). Every minute it:

1. `GET {APP_URL}/api/health` wakes the app if a free instance is asleep
   (cold starts take about 30–60 s; the Worker waits up to 90 s).
2. `POST {APP_URL}/api/internal/outbox?run=inline` with `Authorization:
   Bearer {CRON_SECRET}` makes the web instance do the background work itself,
   once: deliver queued email and webhooks, send loan reminders and overdue
   escalations, open scheduled cycle counts, reconcile pending payments and run
   the retention purge.

That is all a free web-only deployment needs. When a worker and beat run
elsewhere, set the Worker variable `INLINE=false`: it then only queues work
(`/api/internal/outbox` and `/api/internal/jobs`) for that worker. Both paths
are safe to run at once: outbox rows, reminders and jobs are claimed
atomically. The VPS stack ships its own worker and beat and does not need
this Worker.

This folder is a separate package: it is excluded from the app's TypeScript,
ESLint, Vitest and Docker build, and its only dependency is `wrangler`.

## Deploy

```bash
cd deploy/cloudflare-cron
npm ci
npx wrangler login
npx wrangler secret put APP_URL       # e.g. https://inventory.example.org (https, no trailing slash)
npx wrangler secret put CRON_SECRET   # the same value as the app's CRON_SECRET
npx wrangler deploy
```

`wrangler.toml` sets `workers_dev = false`, so the Worker has no public URL.
It only runs on its schedule.

## Operate

- `npx wrangler tail` streams logs. Expect `health 200` and `outbox 200`
  every minute (plus `jobs 204` with `INLINE=false`). Only status codes are logged.
- `404` from outbox or jobs: `CRON_SECRET` differs from the app's value.
- `outbox 500`: the app could not run the outbox (database or SMTP). Check the
  app logs and **Admin → Outbox**.
- After rotating the app's `CRON_SECRET`, run `wrangler secret put CRON_SECRET` again.
- `npm run check` bundles the Worker without deploying it.

Cloudflare's free Workers plan allows 100,000 requests a day; this Worker uses
about 1,440 scheduled runs a day.
