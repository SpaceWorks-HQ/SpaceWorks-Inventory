# Host the complete stack on a VPS

[Documentation index](README.md) · [Docker image details](DEPLOYMENT_DOCKER.md)

Run Space Works Inventory on one Linux VPS with Docker Engine and Docker
Compose. The stack uses two images of its own: the **backend** (the web
application and API, the one-shot migrations, the background worker and beat,
and the operator tools) and the **frontend** (the website alone, used only by
the two-hostname layout). PostgreSQL 16, Redis 7, private Silo S3-compatible
storage and Caddy HTTPS run from their standard images in the same Compose
file. Node.js, PostgreSQL and Redis do not need to be installed on the host.

Production uses `compose.production.yml` through `scripts/vps-compose.sh`.
`docker-compose.yml` starts local development services only; never use it on a
server.

## Before you start

- A 64-bit (x86_64 or arm64) Linux VPS: Ubuntu/Debian, Fedora/RHEL/Alma/Rocky,
  Arch or openSUSE. The installer installs Docker Engine + Compose when missing.
  Start with **2 vCPU, 2 GB RAM and 30 GB SSD** for a small installation, with
  extra space for photos and backups (setup refuses less than 10 GB free).
  These are starting estimates, not load-tested capacity limits. Releases run
  published images; only a source build (`--ref`) compiles on the server, which
  needs about 4 GB of memory. The installer offers a swap file when memory is
  short.
- A domain, such as `inventory.example.org`, whose DNS A record points to the
  VPS. Add an AAAA record only if IPv6 reaches this host too. Start with
  DNS-only records; the supplied proxy assumes clients connect directly to
  Caddy.
- Allow inbound TCP 80 and 443 (plus UDP 443 for HTTP/3) and restrict SSH to
  administrators. Only Caddy publishes application ports (or, behind your own
  reverse proxy, the app listens on `127.0.0.1` only). Do not publish the
  app, database, Redis, storage API or storage console ports.
- An authenticated SMTP relay and a verified sending domain with SPF, DKIM and
  DMARC. Sign-in links, invitations, password resets, loan reminders and
  receipts all go through it; the stack does not operate a public mail server.
  Confirm that the VPS permits outbound SMTP on your relay's port.
- HTTPS that phones trust. Scanning QR codes uses the phone camera, which
  browsers only allow on a secure (HTTPS) page; a LAN install with Caddy's own
  certificate works only on devices that trust it.
- Encrypted host disks and an encrypted, off-server backup destination. A single
  VPS is a single failure domain; Docker volumes alone are not backups or
  automatic point-in-time recovery.

## Guided installation

As root or a user with `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/SpaceWorks-HQ/SpaceWorks-Inventory/main/install.sh | bash
```

While the repository is private, this public URL answers 404: use
[the private repository variant](#private-repository-and-packages) instead.

The bootstrap checks for Linux, the architecture, root or sudo, `curl`/`tar`
and an interactive terminal (over SSH, use `ssh -t`). On a fresh server it asks
once which repository to install from (Enter keeps the official one). It finds
the latest [GitHub Release](CONTAINER_IMAGES.md#versions-and-releases) (or the
one named with `--release v<version>`), checks that the release tag points at
its own commit and downloads that source into temporary storage. The release's
`scripts/setup-vps.sh` then checks disk space and the Docker Compose version
(2.24.4 or newer, if Docker is already installed) and asks every question
first: the hosting layout (below), hostnames, super-admin email, HTTPS, file
storage, verified sender, SMTP relay (password hidden; Brevo is prefilled on
port 2525), automatic deploys, backups (nightly schedule, encryption, off-site
copies; see [Backups and recovery](#backups-and-recovery)) and optional
[server hardening](#server-security). It then checks that the ports it needs are
free (80/443 for Caddy; 8080, and 8081 for the split layout, behind an existing
proxy). Invalid answers are asked again. When memory is short it offers a 4 GB
swap file. It reports what the hostname resolves to and shows one summary of
every answer and host change. **Nothing changes before you confirm.**

After confirmation it creates the swap file if accepted, installs Docker from the
distribution family's official source if missing, copies the release to
`/opt/spaceworks-inventory/releases/<commit>`, downloads the release's backend
image, generates configuration in `/etc/spaceworks-inventory`, downloads the
remaining images from GitHub Packages, applies migrations, waits for healthy
services and runs the VPS checks. `current` then points at the release and
`/opt/spaceworks-inventory/install.conf` records the configuration directory
and the repository to update from.

### Private repository and packages

Public installs need no token. While the repository (and so its container
packages) is private, the installer needs a read-only GitHub credential:

- `SWI_GITHUB_TOKEN` is used for every GitHub request the installer makes:
  the latest-release lookup, the release's commit, and the source tarball
  (downloaded through the API, `api.github.com/repos/<owner>/<name>/tarball/<commit>`,
  instead of the public `codeload` URL). Setup and updates also run
  `docker login ghcr.io --password-stdin` with it before pulling the images.
  The value may contain only letters, digits and underscores (classic `ghp_…`
  and fine-grained `github_pat_…` tokens both qualify).
- `SWI_GITHUB_USER` is the GitHub account that owns the token, used only as the
  GHCR login name. It is optional: when unset, the installer asks
  `api.github.com/user` for the token's login. Set it if that lookup fails.
- When the installer runs through `sudo`, it passes exactly these two
  variables on (`sudo --preserve-env=SWI_GITHUB_TOKEN,SWI_GITHUB_USER`).

Which token: the source download needs read access to the repository's
contents. GitHub's container registry accepts only **classic** personal access
tokens, so pulling private images needs a classic token with the `repo` and
`read:packages` scopes (authorise organisation SSO if it is enforced). A
fine-grained token with *Contents: read* is enough only if the packages are
public. Prefer a dedicated machine account and an expiry date.

Export the token without leaving it in shell history (for example
`read -rs SWI_GITHUB_TOKEN && export SWI_GITHUB_TOKEN`), then fetch the
bootstrap with an authenticated request and run it in the same shell. Any of
these work:

```bash
# 1. GitHub CLI, if it is installed and signed in on the server:
gh api repos/SpaceWorks-HQ/SpaceWorks-Inventory/contents/install.sh \
  -H "Accept: application/vnd.github.raw" | bash

# 2. curl, with the header read from stdin so the token stays out of the process list:
printf 'header = "Authorization: Bearer %s"\n' "$SWI_GITHUB_TOKEN" | \
  curl --config - -fsSL https://raw.githubusercontent.com/SpaceWorks-HQ/SpaceWorks-Inventory/main/install.sh -o /tmp/swi-install.sh
bash /tmp/swi-install.sh && rm -f /tmp/swi-install.sh

# 3. The short form (the token is briefly visible to other users of this host in `ps`):
curl -fsSL -H "Authorization: Bearer $SWI_GITHUB_TOKEN" \
  https://raw.githubusercontent.com/SpaceWorks-HQ/SpaceWorks-Inventory/main/install.sh | bash
```

Because the token is exported, `bash` inherits it; there is no need to repeat
it on the `bash` side of the pipe. Fetch the installer the same way every time
you run it later. Updates (menu option 1) need the token exported; the other
menu entries make no GitHub requests. Docker keeps the GHCR login in the root account's credential
store; use its credential helper where available. Never put the token into
`compose.env`, `install.conf`, shell tracing or a support bundle. When
[automatic deploys](#automatic-deploys) are set up while the token is exported,
`install-runner.sh` stores it in the root-owned, mode-600 file
`/etc/spaceworks-inventory/github-token`, which only the deploy wrapper reads.
Rotate it by replacing that file securely or by re-registering the runner.

### Hosting layouts

Every layout runs PostgreSQL, Redis, Silo storage (unless you choose an
external bucket), the backend image's one-shot `migrate` role, the worker, beat
and Caddy (unless you choose your own proxy):

| Choice | Layout | Containers | DNS |
| --- | --- | --- | --- |
| 1 (default) | `split` | website (`frontend`) and API (`app`, the backend) | two A records to this VPS, e.g. `inventory.example.org` and `api.inventory.example.org` (the default API name) |
| 2 | `single` | one `app` container serves the website and the API | one A record |
| 3 | `netlify` | the API here; the website on [Netlify](DEPLOYMENT_SPLIT.md) | the API record here, the website at Netlify |

> **Choose 2 (`single`) for the 0.1.0 release candidate.** The website image is
> generated from `frontend/pages.json`, which currently covers sign-in, account,
> instance admin and the space home page but not the inventory pages
> (catalogue, loans, desk, transfers, counts, settings, QR landing, public
> catalogue). Payment webhooks also need extra care in the two-hostname layouts;
> see [Split hosting](DEPLOYMENT_SPLIT.md#current-limitations). Revisit this
> once the generated website covers every page.

In `split`, Caddy serves the website hostname from the frontend container and
the API hostname from the backend. The frontend reaches the backend by its HTTPS
name, which Caddy also answers on the private Docker network, so the request
never leaves the server. The two hostnames must differ: the authenticated
gateway between website and API depends on two origins. `compose.env` records
the layout (`SWI_LAYOUT`); installations keep the layout they were set up with.

### HTTPS

Setup asks how HTTPS reaches the stack:

| Choice | What runs | Notes |
| --- | --- | --- |
| 1 LAN or trial | Caddy with its own local certificate authority | For hostnames that are not publicly reachable. Browsers warn, and phone cameras stay off for QR scanning, until the CA (`caddy_data` volume: `caddy/pki/authorities/local/root.crt`) is trusted on each device. The website container receives only that public certificate. |
| 2 Automatic HTTPS (default) | Caddy with Let's Encrypt | DNS must point at this server and ports 80/443 must be reachable. An optional certificate email gets expiry notices. |
| 3 Existing reverse proxy | No Caddy | The API listens on `127.0.0.1:8080` and, in the split layout, the website on `127.0.0.1:8081`. Your proxy terminates HTTPS, preserves `Host`, overwrites `X-Real-IP` with the client address, sends `X-Forwarded-Proto: https`, accepts request bodies of at least 30 MB (photo uploads and spreadsheet imports) and does not buffer responses. In the split layout the website calls the API's HTTPS name through this server's own proxy. |

Behind an existing proxy, the app trusts `X-Real-IP` for rate limits and audit
records, so the proxy **must overwrite** it with the client address (a proxy
that passes the client's own header through lets anyone spoof their IP). In
the split layout the website reaches the API by its HTTPS name on this server's
Docker bridge address, so the proxy must also listen there (or on all
addresses) with a publicly trusted certificate. Examples:

```nginx
# nginx, for each hostname
client_max_body_size 30m;
location / {
  proxy_pass http://127.0.0.1:8080;   # 8081 for the split layout's website
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
  proxy_buffering off;
}
```

```apache
# Apache (mod_proxy, mod_headers)
ProxyPreserveHost On
RequestHeader set X-Real-IP "%{REMOTE_ADDR}s"
RequestHeader set X-Forwarded-Proto "https"
LimitRequestBody 31457280
ProxyPass / http://127.0.0.1:8080/ flushpackets=on
ProxyPassReverse / http://127.0.0.1:8080/
```

Production requires HTTPS origins and secure cookies, so LAN and trial installs
use Caddy's own certificate rather than plain HTTP. `compose.env` records the
choice (`SWI_CADDY_TLS`: `internal`, `proxy`, or unset for automatic).

### File storage

Setup also asks where uploads (item photos and handover evidence photos) live:
bundled **Silo** on this server (default) or an **external S3-compatible bucket**
such as Cloudflare R2 or Amazon S3. For an external bucket, create a private
bucket and an access key limited to it first, then enter the HTTPS endpoint,
region (`auto` for R2), bucket, access key and secret (hidden). The application
reads and writes the bucket itself and re-encodes every photo; browsers never
talk to it, so no CORS or public access is needed. With external storage
(`SWI_STORAGE='external'`) the Silo services do not run and `vps-backup.sh`
copies the database and configuration only: back the bucket up with your
provider. To change the bucket key later use
[Change settings](#changing-settings-later).

### Automatic deploys

An installation can update itself whenever a release is published. Answer
**yes** to *Install a GitHub Actions runner on this server for automatic
deploys?* during setup, or later choose **7) Automatic deploys** in the
installer's menu. The runner (`scripts/install-runner.sh`) asks for a
registration token from the repository's **Settings → Actions → Runners → New
self-hosted runner**, downloads GitHub's official runner, checks it against the
published SHA-256, registers it with the label `spaceworks-inventory-prod` and
runs it as a systemd service under its own unprivileged account, `swi-runner`.
Then, in the repository:

1. **Settings → Secrets and variables → Actions → Variables:** add `SWI_DEPLOY` = `true`.
2. **Settings → Environments → production → Deployment branches and tags:**
   selected branches, `main` only (optionally add required reviewers).
3. **Settings → Actions → General → Fork pull request workflows:** require approval
   for all external contributors.

Each GitHub Release (a `VERSION` bump reaching `main`) then ends with a `deploy`
job on this server that runs `sudo /usr/local/sbin/swi-deploy v<version>`,
which runs `scripts/vps-deploy.sh`: it accepts only a published, non-draft,
non-pre-release GitHub Release whose commit is on `main`, then runs the updater
(a backup, the new images, migrations, health checks, and the previous release
restored if the new one is unhealthy). Nothing connects in from GitHub; the
runner polls outward.

**Security model.** A repository-level runner accepts any workflow that names
its label, so anyone who can push workflows to the repository can run code on
this server. That code runs as `swi-runner`, which has no Docker access; its
only root permission (`/etc/sudoers.d/spaceworks-inventory-deploy`) is the deploy
wrapper. Keep write access to trusted maintainers. Remove the runner with menu
option 7 or `sudo bash /opt/spaceworks-inventory/current/scripts/install-runner.sh --remove`,
then delete the `SWI_DEPLOY` variable.

### Other options

`--ref` installs a branch, tag or commit instead and **builds** its images on the
server (versions `vps-<commit>`); a later update moves it to the latest release.
`--dir` changes the installation directory and `--repo owner/name` installs a
fork, which needs its own published release (or `--ref`). `--help` prints the
installer's guide. Pass options as
`curl … | bash -s -- --dir /srv/spaceworks-inventory`. To keep secrets somewhere
other than `/etc/spaceworks-inventory`, set the variable on the `bash` side of
the pipe: `curl … | SWI_CONFIG_DIR=/srv/swi-config bash`. Running
`curl … | sudo bash` as root works too. DNS and SMTP provisioning remain
operator tasks.

Answers are stored in single-quoted env files, so the sender, SMTP login and
password cannot contain `'` or `\`; the installer asks again if they do.

If setup stops after confirmation (a failed download, a full disk), fix the
cause and run the one-liner again: it offers to **resume** that release without
generating new secrets. Only one install, update, backup or restore runs at a
time.

From a reviewed checkout, `sudo bash scripts/setup-vps.sh` asks the same questions
and runs the stack from that checkout instead of `/opt/spaceworks-inventory`
(timers, automatic deploys and installer updates are then not available). For
explicit commands or automation, follow the manual steps below.

## 1. Get a reviewed release and generate configuration

Clone the repository and check out the reviewed commit you intend to deploy.
Use a new version label for every build. Build images locally below, or use a
trusted build host and transfer the same versioned images to the VPS.

```bash
git clone https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory.git
cd SpaceWorks-Inventory
git checkout <reviewed-commit-or-tag>
SWI_VERSION="vps-$(git rev-parse --short=12 HEAD)"
export SWI_CONFIG_DIR=/etc/spaceworks-inventory
sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$SWI_CONFIG_DIR"

# The backend image, with placeholder origins and a throwaway build key.
SWI_BUILD_KEY=$(openssl rand -base64 32) docker build --target runner \
  --build-arg NEXT_PUBLIC_BASE_URL=https://spaceworks-inventory-origin.invalid \
  --secret id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=SWI_BUILD_KEY \
  --tag "swi-backend:$SWI_VERSION" .
docker run --rm --user "$(id -u):$(id -g)" \
  --volume "$SWI_CONFIG_DIR:/config" \
  "swi-backend:$SWI_VERSION" node docker/vps/setup.mjs \
  inventory.example.org admin@example.org "$SWI_VERSION"
```

Replace the hostname and admin email. For the split layout, pass the API
hostname first, then the website hostname and `split`
(`api.inventory.example.org admin@example.org "$SWI_VERSION" inventory.example.org split`).
Setup refuses an existing configuration; **do not rerun it to upgrade**. It
generates independent application secrets, separate migration/runtime database
passwords, separate storage root/application credentials, a Redis password and
a private CA with certificates for internal services. It writes them to
owner-only files outside Git without printing them.

Edit `$SWI_CONFIG_DIR/app.env` in a trusted editor. Set `EMAIL_FROM`,
`SMTP_HOST`, `SMTP_USER` and `SMTP_PASSWORD` to real values (they start as
`CHANGE_ME`, and the checks refuse to run until they are replaced). Use
`SMTP_PORT='587'` with `SMTP_SECURE='false'` for STARTTLS, or port 465 with
`SMTP_SECURE='true'` for implicit TLS, according to your relay. Keep the
generated secrets and connection URLs. Single-quoted environment values
preserve literal `$` characters; follow
[Compose's env-file syntax](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/#env-file-syntax)
if a provider credential contains quotes or special characters.

Keep an encrypted backup of this entire directory, especially
`MFA_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY`, the stable Server Actions
key and the CA. Losing the MFA key makes stored authenticator seeds unreadable;
losing the integration key makes the saved Razorpay, Stripe and webhook signing
secrets unreadable. Do not copy these files into the checkout, publish images
publicly, enable shell tracing, or paste expanded Compose configuration into logs.

## 2. Build, check configuration and start

Run from the checked-out repository with `SWI_CONFIG_DIR` still exported:

```bash
scripts/vps-compose.sh config --quiet
scripts/vps-compose.sh build app            # and frontend, for the split layout
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs preflight
scripts/vps-compose.sh up -d
scripts/vps-compose.sh ps
```

The images carry placeholder origins, replaced when each web container starts,
so they need no rebuild when a hostname changes; every container receives its
own Server Actions key at runtime. Credentials for PostgreSQL, Redis, storage
and SMTP are runtime inputs, not build arguments.

Compose waits for PostgreSQL and Redis health, creates the private storage
bucket and application policy, and applies Prisma migrations before starting the
app, worker and beat. Migration failure blocks their startup. Caddy waits for app
health. Caddy obtains and renews the public TLS certificate; it needs working DNS
and reachable ports 80/443. This can take a short time on first startup.

The database rejects non-TLS TCP connections. Redis accepts TLS and password
authentication only. The app verifies internal certificates through the private
CA and uses a database role without superuser, role-management or database-creation
rights. Only the migrator receives the database administration credential; only
storage and its initializer receive the storage root credential. The CA signing
key is never mounted into a running service. Private images and encrypted host
storage remain operator responsibilities.

## 3. Verify and create the first account

```bash
scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
scripts/vps-compose.sh run --rm --no-deps ops node scripts/prisma.mjs migrate status
curl --fail https://inventory.example.org/api/health
```

The VPS check verifies production settings, live database TLS, the runtime role,
the schema contract, authenticated Redis over TLS, access to the storage bucket,
worker and beat health, bearer-protected `/api/health/db` and, in the split
layout, the website-to-API gateway. It never prints credentials or response
bodies. The storage initializer explicitly disables anonymous bucket access.

Open `https://inventory.example.org/setup`. The setup wizard creates the
instance admin account and your first makerspace; use the configured
`SUPER_ADMIN_EMAIL` for it so [super-admin recovery](#super-admin-recovery)
works. The wizard then walks through the space setup (locations, categories,
lending policy, team and optional sample data) at `/s/<slug>/setup`. Enable
two-step verification under **Account**, then open `/admin` with a fresh
authenticator code. Members join by invitation, or by self sign-up only if you
turn it on in `/admin` (see [Configuration](CONFIGURATION.md#settings-inside-the-app)).
Do not seed demo data on production.

Then work through the [acceptance checklist](production-operations.md#acceptance-checklist).
The worker processes background jobs (email, webhooks, loan reminders, count
schedules, payment reconciliation, retention); beat reconciles the repeat
schedules on startup. Both use the same backend image and `app.env`, expose
health only on their private port 3460, and drain active work on SIGTERM. The
status check and support bundle include both roles. Open `/admin/jobs` with
fresh MFA for counts, failed jobs, retry/remove and pause/resume, and
`/admin/outbox` for email delivery.

## Upgrades and rollback

Run the one-liner again and choose **1) Update to the latest release** (or pass
`--update` to skip the menu). The menu also offers **2) Back up now** and
**3) Check status and health**. The updater:

1. stops if the installation already runs the latest release (`--release` picks
   another, `--ref` a source build);
2. shows the current and new version and asks for confirmation;
3. backs up the database and configuration (`scripts/vps-backup.sh --no-objects`);
4. changes only the version and image names in `compose.env`, downloads the new
   images (or builds them for `--ref`) while the site keeps running, runs
   preflight, stops the worker and beat, applies migrations and verifies the
   schema;
5. recreates the services, waits for them to be healthy and runs the VPS checks;
6. points `current` at the new release and keeps the three newest releases and
   their images.

If any step after the backup fails, it restores the previous `compose.env` and
starts the previous release's retained images. **Migrations that already ran are
not reversed**; review migrations before updating, and restore the pre-update
backup if an older release cannot run on the newer schema. For automation, unpack
the new release with its commit in a `.release` file (and, for a published
release, its version in `.release-version`) and run
`sudo bash <new release>/scripts/update-vps.sh --yes`; it is copied into
`releases/` like any other update. For the Netlify layout, deploy the identical
commit to Netlify after the backend update.

For a checkout-based installation, follow the manual steps below.

Back up first and record the current commit and image version. Review database
migrations for compatibility before changing the running installation.

1. Check out the new reviewed commit. Change only `SWI_VERSION` in the external
   `compose.env` to a new, immutable release label; retain all secrets and volumes.
2. Build the new images and run preflight as in step 2 above.
3. Stop the consumers, apply migrations once, then verify the schema before
   replacing the app:

   ```bash
   scripts/vps-compose.sh stop worker beat
   scripts/vps-compose.sh run --rm migrator
   scripts/vps-compose.sh run --rm --no-deps ops node scripts/verify-production-schema.mjs
   scripts/vps-compose.sh up -d
   scripts/vps-compose.sh run --rm --no-deps ops node docker/vps/check.mjs
   ```

4. Verify public HTTPS, sign-in, email, a photo upload and a QR scan. Keep
   previous images until the release is healthy. Do not run
   `docker image prune -a` during rollout.

To revert application code, restore the previous checkout and its version label,
then recreate the services from those retained images. Reverting images does
**not** undo migrations. A database rollback requires an explicit restore from a
verified backup and a compatible application version. Do not reset volumes to
repair an upgrade.

A hostname change by hand needs matching `PUBLIC_HOST` and `PUBLIC_ORIGIN` in
`compose.env` (and `SITE_HOST` in the split layout), matching `AUTH_URL` /
`NEXT_PUBLIC_BASE_URL` in `app.env` and recreated services; the installer's
[Change settings](#changing-settings-later) does all of this for you. Also
update DNS, monitoring and the webhook URL in each space's Razorpay and Stripe
dashboards. Printed QR labels carry the old hostname: the in-app scanner still
reads them, but a phone's own camera app opens the old address, so keep an
HTTPS redirect from the old hostname. Keep `actions-key` and its matching
runtime key stable across ordinary builds and upgrades.

## Backups and recovery

Persistent volumes hold PostgreSQL, Redis and, when they run here, Silo object
storage and Caddy certificates. Back up **both database and uploaded photos**,
plus the external configuration:

```bash
sudo bash /opt/spaceworks-inventory/current/scripts/vps-backup.sh
```

The services keep running. The script writes `/etc/spaceworks-inventory/backups/<UTC time>/`
with a consistent `database.dump` (checked with `pg_restore --list`), `config.tar.gz`
(every secret, including `MFA_ENCRYPTION_KEY` and the CA) and `objects/` (every
uploaded photo, mirrored from Silo). `--no-objects` skips the photos; updates,
settings changes and restores use it. A backup stays on the server for
`BACKUP_KEEP_DAYS` (default 14), but the newest three full and three
database-only backups always stay, and the backup being restored is never
removed.

Run the installer again and choose **4) Backups** to change the settings, which
are saved in `/etc/spaceworks-inventory/backup.env`. Setup asks about the first
three:

| Setting | What it does |
| --- | --- |
| **Nightly backups** | A systemd timer (`swi-backup.timer`) runs a full backup at about 02:30 UTC. |
| **Encryption** | Every backup becomes `backup.tar.age`, encrypted with [age](https://age-encryption.org) to a public key. The private key (`AGE-SECRET-KEY-…`) is shown **once** and is not stored on the server: keep it in your password manager. Only `version` and `kind` stay readable. |
| **Off-site copies** | After each backup, an encrypted copy goes to an S3-compatible bucket at another provider (R2, B2, S3…), kept for its own number of days (default 90). Only encrypted backups are sent. |
| **Retention** | Days a backup stays on this server. |

Each run writes `/etc/spaceworks-inventory/status/backup.json` (time, result,
size, encryption and off-site status, no secrets). The installer's **3) Check
status and health** shows the newest backup; alert on `backup.json` from your
own monitoring. Keep encrypted off-server copies and test restores.

To restore on the same installation:

```bash
sudo bash /opt/spaceworks-inventory/current/scripts/vps-restore.sh /etc/spaceworks-inventory/backups/<time>
```

For an encrypted backup it asks you to paste the key (or pass `--identity FILE`).
`vps-restore.sh offsite:<time>` first downloads that backup from the off-site
bucket; the installer menu's **Backups → List off-site backups** shows the names.
It shows what will be replaced and asks you to type `RESTORE`. It backs up the
current database first, stops the app, Caddy, worker and beat (and the website
in the split layout), and replaces the database in one transaction. It then
copies the backup's photos back into Silo (newer files stay), starts
everything (migrations bring an older backup up to the running release) and
runs the VPS checks.

### Restore on a new server

Restore the configuration before anything else, because the database holds
data encrypted with its keys. Do not run a fresh install: it would generate
different keys. Copy the backup directory to the server (here `/root/<time>`).
If it is encrypted (`backup.tar.age`), install `age` and decrypt it in place
first, with the key saved in `key.txt`:
`age --decrypt --identity key.txt /root/<time>/backup.tar.age | tar -xf - -C /root/<time>`.
Then, as root, unpack the release named in its `version` file and record it as
an unfinished installation (add `-H "Authorization: Bearer $SWI_GITHUB_TOKEN"`
to both `curl` calls, and use the API tarball URL, while the repository is
private):

```bash
backup=/root/<time>
version=$(cat "$backup/version")   # a release such as 0.1.0-main.42.<commit>, or vps-<commit>
case "$version" in vps-*) ref=${version#vps-} ;; *) ref=v$version ;; esac
commit=$(curl -fsSL -H 'Accept: application/vnd.github.sha' \
  "https://api.github.com/repos/SpaceWorks-HQ/SpaceWorks-Inventory/commits/$ref")
release=/opt/spaceworks-inventory/releases/$commit
mkdir -p "$release"
curl -fsSL "https://codeload.github.com/SpaceWorks-HQ/SpaceWorks-Inventory/tar.gz/$commit" | tar -xz -C "$release" --strip-components=1
echo "$commit" > "$release/.release"
case "$version" in vps-*) ;; *) echo "$version" > "$release/.release-version" ;; esac
install -d -m 0700 /etc/spaceworks-inventory
tar -xzf "$backup/config.tar.gz" -C /etc/spaceworks-inventory
printf "SWI_CONFIG_DIR='/etc/spaceworks-inventory'\nSWI_PENDING_RELEASE='%s'\n" "$commit" > /opt/spaceworks-inventory/install.conf
command -v docker >/dev/null || bash "$release/scripts/install-docker.sh"
```

Run the one-liner and choose **Resume**. It downloads (or, for a `vps-` version,
builds) and starts that release with the restored keys. Then run
`vps-restore.sh "$backup"` and point DNS at the new server. Later updates work
as usual.

Nightly, encrypted, off-site backups with alerts cover a day's data loss at most.
For tighter recovery points, add PostgreSQL WAL archiving/PITR yourself, and run
regular restore drills on an isolated host. Never run
`scripts/vps-compose.sh down --volumes` on an installation you want to retain.
See [Production operations](production-operations.md) for monitoring and
incident requirements.

## Certificate renewal and monitoring

Caddy renews public HTTPS certificates automatically while DNS and ports remain
reachable. Internal service certificates (PostgreSQL, Redis, Silo) last **one
year**. On installations made by the installer, a weekly systemd timer
(`swi-certificates.timer`) renews them once they are within 60 days of
expiry, restarts the services and runs the checks; updates add it to
installations that lack it. To renew now, as root:

```bash
sudo bash /opt/spaceworks-inventory/current/scripts/vps-renew-certs.sh
```

From a checkout without the timer, run the same script there (with
`SWI_CONFIG_DIR` set) at least once a year; `--if-due` renews only when due.
Renewal retains the existing CA and all credentials; expect a short interruption
while services restart. The CA itself lasts ten years and needs a planned trust
rotation before expiry. Monitor disk space, certificate expiry, HTTPS, authenticated
readiness, Redis availability, database connections, outbox failures and fresh
backups. Container restart policies do not restart a process merely because its
healthcheck becomes unhealthy; alert and investigate.

## Changing settings later

Run the installer again and choose **5) Change settings**:

- **Hostnames.** New website and API hostnames (one hostname in the single layout).
  Point DNS first. Everyone is signed out, and links already sent (invitations,
  sign-in links and resets) keep the old hostname. On Netlify, set the new
  values there too. Update the payment webhook URLs afterwards (see above).
- **Outgoing email.** New sender, relay, login and password. The installer logs in
  to the relay (`check.mjs smtp`) before keeping the change.
- **Bucket credentials.** A new access key for an external bucket.

Each change backs up the database and configuration, recreates the services and
runs the checks. If anything fails, the previous settings are put back. Moving
between bundled Silo and an external bucket is a data migration, not a setting:
copy the objects with `mc mirror`, then reinstall with the restored configuration.
Email settings saved in **`/admin` → Instance settings** override the
installer's; the `/admin` → **Email outbox** tab shows what was sent and why a
message failed.

## Server security

Setup offers it, and the menu's **6) Server security** runs it again. Each part
is optional:

- **Firewall:** ufw on Debian/Ubuntu, or firewalld where it runs. It allows only
  SSH (every port sshd listens on), HTTP and HTTPS. If the SSH port cannot be
  found, the firewall is left alone so you are not locked out. Docker publishes
  ports past ufw; this stack publishes only 80 and 443, or `127.0.0.1` ports
  behind your own proxy.
- **Automatic security updates:** unattended-upgrades or dnf-automatic, security
  fixes only.
- **fail2ban:** bans an address for an hour after five failed SSH logins.

## Super-admin recovery

If the super admin loses their authenticator or password, someone with root on
the server chooses **8) Recover super-admin access**. It works only for the
account whose email is `SUPER_ADMIN_EMAIL` in `app.env`. It removes that
account's authenticator and recovery codes, signs it out everywhere, records an
audit event and prints a password-reset link valid for one hour. Open it, set a
password, sign in, then set up an authenticator again.

## Support bundle and uninstall

**9) Support bundle** collects the release, settings without secrets, service
state, the checks, disk and memory, and the last 500 log lines of each service
into `/opt/spaceworks-inventory/support/`. Credentials, tokens and keys are
redacted, but logs can hold email and IP addresses, so read it before sharing.

**10) Uninstall** removes the containers, timers, runner, images and
`/opt/spaceworks-inventory`. The database and photos (Docker volumes) and
`/etc/spaceworks-inventory` (secrets and backups) are kept unless you type
`DELETE DATA`. Docker, swap and any hardening stay in place. To reinstall with
the kept data, follow [Restore on a new server](#restore-on-a-new-server).

## A separate frontend on Netlify

Choose layout 3 in the installer and follow
[Netlify frontend with a Docker VPS backend](DEPLOYMENT_SPLIT.md). The same data
services, private TLS, migrations, worker, beat, backups and renewal procedures
apply. `PUBLIC_HOST` is the VPS API hostname; `PUBLIC_ORIGIN`, `AUTH_URL` and
`NEXT_PUBLIC_BASE_URL` are the website's HTTPS origin. Public variables require
redeploying the Netlify site when they change.
