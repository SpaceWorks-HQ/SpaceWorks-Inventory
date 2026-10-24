# Space Works Inventory documentation

Space Works Inventory is the self-hosted stock room and lending desk for
makerspaces: the catalogue with QR-tagged assets, locations, stock receipts
and adjustments, cycle counts, transfers between locations and between the
spaces of one install, member lending (free or paid through Razorpay, Stripe,
cash or pay later) with QR scans and photo evidence at every handover,
reports, an audit log, webhooks and a REST API.

## Run it

| Guide | When to use it |
| --- | --- |
| [Host the complete stack on a VPS](DEPLOYMENT_VPS.md) | One Linux server, one-line installer, everything included (recommended) |
| [Cloud deployment](DEPLOYMENT_CLOUD.md) | Render (one-click Blueprint) or DigitalOcean App Platform with managed PostgreSQL, Redis, storage and email |
| [Production Docker deployment](DEPLOYMENT_DOCKER.md) | Your own Docker host or orchestrator with services you already run |
| [Netlify frontend with a Docker VPS backend](DEPLOYMENT_SPLIT.md) | The website and the API on two hostnames |
| [Configuration](CONFIGURATION.md) | Every environment variable, and what is set inside the app instead |
| [Releases and container images](CONTAINER_IMAGES.md) | Versions, GitHub Releases and the two published images |
| [Production operations](production-operations.md) | Acceptance checklist, monitoring, backups, background jobs and incidents |

## Understand it

| Document | What it covers |
| --- | --- |
| [Decisions](DECISIONS.md) | Every product and owner decision, dated, and the checks left for the owner |
| [Architecture](ARCHITECTURE.md) | Shape of the application, data model, stock buckets and the main flows |
| [Invariants](INVARIANTS.md) | The rules every screen, API call and job keeps, and where they are enforced |
| [Roles and permissions](RBAC.md) | Inventory manager, staff and member, and the role matrix |
| [REST API](API.md) | API keys, scopes, endpoints and webhooks |
| [Design system](DESIGN.md) | Tokens, type, components and the Space Works look |
| [Testing](TESTING.md) | Test suites and what to run when |

## Project

- [Contributing](../CONTRIBUTING.md): branches, checks, conventions and commit style.
- [Security policy](../SECURITY.md): how to report a vulnerability privately.
- [Changelog](../CHANGELOG.md) and [notices](../NOTICE).
- Licence: [AGPL-3.0-or-later](../LICENSE).
