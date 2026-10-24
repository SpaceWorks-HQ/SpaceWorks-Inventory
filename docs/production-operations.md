# Production operations

[Documentation index](README.md) · [VPS operations](DEPLOYMENT_VPS.md)

Monitor public HTTPS, dependency-free `/api/health`, authenticated
`/api/health/db`, Redis availability, database connections, storage access,
queue failures, the email outbox, disk, certificate expiry and fresh backups.
An unhealthy Docker healthcheck does not itself restart a process; alert and
investigate. Keep logs free of cookies, credentials, sign-in and invitation
links, and webhook bodies. Review support bundles before sharing them.

## Acceptance checklist

Run through this after the first deployment, after every hostname or email
change, and on a restored server. Use a phone on mobile data for the scanning
steps, so you test the public HTTPS route.

1. **Setup wizard.** `/setup` creates the instance admin and the first
   makerspace, then `/s/<slug>/setup` walks through locations, categories,
   lending policy and team. (On an existing install `/setup` redirects to
   sign-in.)
2. **Sign-in.** Sign out and back in with email and password. Enable two-step
   verification under **Account**, sign in again with a code, and open
   `/admin` with a fresh code. Check the sign-up policy and email settings in
   **Instance settings**.
3. **Magic link email.** On the sign-in page, request an emailed sign-in link
   and use it. Invite a test member and accept the invitation; request a
   password reset. Each email should arrive within a minute; `/admin` →
   **Email outbox** shows anything that failed.
4. **QR scan on a phone.** Print or display a QR label (**Labels**), then scan it
   with the in-app scanner on a phone. The camera only starts on HTTPS (or
   `localhost`); on a LAN install with a private certificate, trust it on the
   phone first. Scanning the same label with the phone's own camera app should
   open `/q/<code>` on your hostname.
5. **Photo upload.** Add a photo to an item. It should appear in the catalogue
   for members of that space; signed-out visitors see it only when the space's
   public catalogue is on and the item is lendable.
6. **Issue and return.** As a member, request a loan; as staff, approve it, then
   issue it at the desk with the QR scans, the required evidence photos and
   remarks; return it (one part damaged, if you like) and check the stock
   balances and the loan's evidence.
7. **A transfer.** Move stock between two locations of the space, or send a
   transfer to a second space of the install: approve, dispatch with scans and
   photos, then receive it on the other side.
8. **A webhook test.** Under **Space settings → Integrations**, add a webhook
   endpoint (a request inspector you control), choose **Send test event**, and verify the
   `X-SpaceWorks-Signature` header (`t=…,v1=…`, HMAC-SHA256 of `<t>.<body>`)
   with the secret shown once at creation. Delivery needs the worker running.
9. **A payment in test mode.** If the space charges for loans, set up Razorpay
   or Stripe in **test mode** with the webhook URL from **Space settings →
   Payments** (see [Payment providers](CONFIGURATION.md#payment-providers)),
   pay a deposit with the provider's test card or UPI, and confirm the payment
   settles in the app. Refund it and confirm the refund settles too.
10. **Backups.** Take a backup (VPS: installer menu **2) Back up now**; managed
    services: your provider's backups plus `npm run db:backup`), confirm the
    photos and the encryption keys are included or copied separately, and
    restore it on an isolated host at least once.

## Releases and recovery

Use immutable backend and frontend images. Take database and configuration
backups before migrations, retain the previous release and verify readiness
before accepting traffic. A failed application rollout restores old images;
database changes require a reviewed restore when backward compatibility is
unavailable.

The VPS menu manages nightly backups, retention, age encryption, off-site S3
copies, TLS renewal, host hardening, super-admin recovery and settings
rollback. Restore requires typing `RESTORE`; uninstall keeps data unless
`DELETE DATA` is typed. The configuration holds the MFA and integration
encryption keys: recover it with the data before starting a replacement server.
Keep the age private key away from the server. Test a restore on an isolated
host at least quarterly.

For managed databases, run `npm run db:backup` from a trusted checkout with
PostgreSQL client tools that match the server version and a direct TLS
connection. Archives and their checksum metadata stay in the ignored
`backups/` directory; pass `--s3-bucket`, `--s3-endpoint`, `--s3-region`,
`--s3-access-key-id` and `--s3-secret-access-key` to upload a copy off-site.
`npm run db:restore` takes `--file <archive>` (or `--s3-key`), `--production`
and `--confirm-database <name>`, and takes a safety backup first. Photos live
in the bucket: copy it with your provider's tools. Do not put secrets in
support tickets or shell history.

## Background work

Run worker and beat from the same backend release and runtime configuration.
The web server never runs production timers. Beat keeps the periodic jobs
registered (`lib/scheduled/index.ts`): the outbox relay every five seconds,
loan reminders and overdue escalation every five minutes, payment
reconciliation every ten, count schedules every fifteen and retention daily.
The worker delivers email and outbound webhooks from the transactional outbox
and runs those jobs. Monitor `http://worker:3460/health` and
`http://beat:3460/health` internally, and `/admin/jobs` with fresh super-admin
MFA. Failed jobs stay in their queue's bounded failed set; check the service
configuration, then retry or remove them from **Jobs**. Pause and resume affect
new claims; active handlers finish.

The VPS status check probes both roles and support bundles include their logs.
Stop worker and beat with the app during a database restore. Allow up to ten
minutes for SIGTERM draining (Render caps this at five). A forced kill may
replay work: every job is idempotent, but SMTP acceptance and the final
database write are not atomic, so a crash between them may send an email twice.

For hosts without beat, call both `/api/internal/outbox` and
`/api/internal/jobs` every minute with `CRON_SECRET` in the `Authorization`
header. The [Cloudflare cron Worker](../deploy/cloudflare-cron/README.md) or
`node scripts/scheduler.mjs --once` can provide that trigger. Both endpoints
only enqueue and return 503 when Redis is unavailable; a live worker is still
required. Never put bearer secrets in monitoring URLs.

Only trust IP headers overwritten by your edge. For Render's appending proxy,
use `x-forwarded-for` with `TRUSTED_PROXY_HOPS=1`; Caddy overwrites
`X-Real-IP`. Disable HTML rewriting and injected scripts at a CDN; the nonce
content security policy and `Cache-Control: no-transform` stay in place.

## Identity, privacy and incidents

First-run account creation is `/setup`; later accounts come from invitations,
or from the sign-in page when `/admin` allows open sign-up. The instance admin
is the setup wizard's account (and `SUPER_ADMIN_EMAIL`), always behind a fresh
authenticator code. Settings in `/admin` override the bootstrap email settings.
Encrypted secrets stay write-only. Root-only recovery on the VPS resets the
configured admin's MFA, revokes their sessions and creates a one-hour, hashed,
single-use password-reset link.

Members can download their own data from **Account**. Evidence photos, the
stock ledger and the audit log are append-only by design; remove a person's
access by disabling the account in `/admin` or removing the membership, and
record corrections as new entries rather than edits. Treat a provider's SMTP
acceptance as hand-off; monitor bounces and delivery separately. Record
incidents, restore drills, access reviews and credential rotation in your
operating records, and report vulnerabilities as described in
[SECURITY.md](../SECURITY.md).
