# Security policy

## Reporting a vulnerability

Please report security problems **privately**, never in a public issue,
discussion or pull request.

Use GitHub's private vulnerability reporting: open the repository's
**Security** tab and choose **Report a vulnerability**
(<https://github.com/SpaceWorks-HQ/SpaceWorks-Inventory/security/advisories/new>).
Only the maintainers can see the report. Include:

- what an attacker can do, and which role or access they need;
- the version or commit, and the hosting layout (VPS installer, Render,
  Docker, split website);
- steps to reproduce, ideally against a disposable installation with demo data;
- any logs or requests, with secrets, cookies and personal data removed.

We aim to acknowledge a report within three working days and to agree a
disclosure date with you once a fix is ready. We credit reporters in the
advisory unless you would rather we did not. Please do not access other
people's data, disrupt a live installation or run automated scanners against
installations you do not operate.

## Supported versions

Space Works Inventory is in its first release series. Security fixes go into
the latest GitHub Release only; update by rerunning the installer (or pulling
the newest image) rather than patching an older version.

| Version | Supported |
| --- | --- |
| 0.1.x (latest release) | Yes |
| Earlier builds, pre-releases and `dev` | No |

## Security model in brief

The full rules are in [docs/INVARIANTS.md](docs/INVARIANTS.md) (tenancy,
security and data integrity) and [docs/RBAC.md](docs/RBAC.md) (roles and
permissions). In short:

- **Tenancy.** Each makerspace (`Space`) is a tenant. Every page, Server Action,
  API call and file route checks membership and filters by space; unknown,
  archived and foreign spaces, records and QR codes all answer the same
  not-found. A transfer between spaces checks each side against its own
  membership.
- **Roles.** Owner, admin, inventory manager, staff and member, checked on the
  server for every request (`lib/roles.ts`); hiding a button is never the only
  check. The instance admin area (`/admin`) needs a fresh authenticator code.
- **Sign-in.** Email and password, emailed single-use sign-in links and TOTP
  two-step verification with recovery codes. Sessions can be revoked
  everywhere. Rate limits protect sign-in, actions and the API.
- **Secrets.** Invitations, sign-in links, password resets and API keys are
  random bearer values stored only as SHA-256 hashes. Payment provider secrets
  and webhook signing secrets are AES-GCM encrypted with purpose-specific keys
  and are write-only in the interface. Bearer values never appear in logs or
  audit metadata.
- **Money and evidence.** Payment webhooks verify the provider's signature and
  apply each event once. Evidence photos, the stock ledger and the audit log
  are append-only, enforced by database triggers.
- **Outbound webhooks** are HMAC-signed, reach public addresses only (DNS is
  pinned per request) and carry ids and quantities, never emails or remarks.
- **Uploads** are decoded under a pixel limit, stripped of metadata, re-encoded
  as WebP and stored under random, tenant-prefixed keys in a private bucket,
  served only through routes that check access.
- **Deployment.** Production refuses to start without HTTPS origins, TLS to
  PostgreSQL and Redis, and its encryption keys. The VPS stack keeps the
  database, Redis and storage on a private network with internal TLS and a
  least-privileged database role.

Operators: see [Production operations](docs/production-operations.md) for
monitoring, backups and incident handling.
