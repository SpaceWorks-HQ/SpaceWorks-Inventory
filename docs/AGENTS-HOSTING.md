# Agent hosting and installation

Space Works Inventory embeds `@spaceworks-hq/agents` in its backend. There is no
central Agents server to host or subscribe to. Your Inventory deployment runs
the adapter; you start an optional separate Telegram worker on infrastructure
you operate. GitHub hosts source and release artifacts, not running staff jobs.

## Installation and module map

The integration already pins the Agents v0.3.1 tarball and lockfile integrity:

```sh
# For a new selected host; this integration already includes the dependency.
npm install https://github.com/SpaceWorks-HQ/SpaceWorks-Agents/releases/download/v0.3.1/spaceworks-hq-agents-0.3.1.tgz
```

Installing the package alone does not connect stock or permissions. This
reviewed integration supplies those bindings:

| File | Responsibility |
| --- | --- |
| `lib/agents/adapter.ts` | Native operation dispatch and transactional receipt/idempotency boundary |
| `lib/agents/identity.ts`, `operations.ts` | Fresh account/space membership, roles, policy version and advertised operations |
| `lib/agents/mentor.ts` | Catalogue capability tags, current availability, suggestions and native item links |
| `lib/agents/http.ts`, `activation.ts` | Session authentication, tenancy and exact reviewed dev-PR merge gate |
| `app/api/ops/v1/[spaceSlug]/[...path]/route.ts` | GET/POST Node.js route under `/api/ops/v1/<spaceSlug>` |
| `app/s/[spaceSlug]/mentor/page.tsx`, `components/agents/` | Staff/manager Project mentor and private Telegram linking |
| `app/api/ops/telegram/[spaceSlug]/route.ts` | Bodyless authenticated link issue/revocation API |
| `lib/agents/telegram/{config,links,bindings,http}.ts` | Private stores, account linking, runtime binding and link API support |
| `scripts/build-telegram.mjs` | Builds `dist/inventory-telegram.mjs` for the CLI to load |
| `prisma/schema.prisma`, migration `20261025120000_agent_operation_receipts` | Native PostgreSQL receipts committed with stock/lending effects |

The backend owns all domain actions, including for a separately deployed
frontend. The polling worker loads the same native adapter and accesses the
native database; it does not impersonate a browser session or use the reference
demo ledger. Existing Redis/BullMQ worker and beat processes remain separate.

Read endpoints: `health`, `status`, `snapshot`, `capabilities`, `discovery` below
the tenant helper prefix. Mentoring: `POST .../mentor/plan`. Native write routes:
`POST .../operations/stock.receive`, `stock.adjust`, `lending.request`,
`lending.approve`. The host's existing role/policy checks apply. Mentoring
returns native item handoffs and no executable stock-taking proposal. Issue,
return, payments, physical QR scans and required photos stay in the native desk.

## Build and deployment order

1. Review the exact integration PR into `dev`, then let a human merge. Preserve
   the reviewed PR head and resulting dev-merge SHA. Source changes and installed
   endpoints are not permission to run production business writes.
2. Back up native PostgreSQL and private bot state. Use Node.js 22 and the normal
   Inventory release process: `npm ci`, `npm run db:deploy`, `npm run build`, and
   `npm run build:telegram`. Follow the normal migration/environment requirements
   in [VPS deployment documentation](DEPLOYMENT_VPS.md).
3. Deploy the reviewed web/backend build. Provision the optional polling worker
   with installed dependencies, generated Prisma client and its built binding.
   A lone `.mjs` file in an empty image is insufficient.
4. Independently check deployed revision and host health; configure trusted
   activation evidence. Configure shared state and model runtime as below.
5. Start the supervised worker, privately link an existing staff account and
   verify delivery, permissions and restart persistence before live operation.

**Current deployment manifests need extension.** The Docker builder runs
`build:jobs`, not `build:telegram`. Runtime images do not install `codex` or `gh`.
Existing Compose and Render worker/beat services do not start Telegram. There
is no supplied agent container profile, managed Codex service or automatic bot
deployment. A production extension must explicitly build the binding, package
dependencies/CLIs, authenticate the service account, mount private volumes and
supervise the worker. The standard Inventory installer alone does not do this.

## Environment and service placement

Keep normal Inventory database/auth configuration. Set these identically in
**web/backend and bot**; these example placeholders are not usable credentials:

```text
NEXT_PUBLIC_BASE_URL=https://inventory.example.org
AGENTS_TELEGRAM_NAMESPACE=inventory
AGENTS_TELEGRAM_DATA_DIR=.data/agents-private
AGENTS_INTEGRATION_PR=<reviewed PR number>
AGENTS_INTEGRATION_HEAD=<exact reviewed PR head SHA>
AGENTS_VERIFIED_REVISION=<independently verified deployed dev-merge SHA>
```

`activation.ts` invokes authenticated `gh` to read the exact merged PR into
`dev` and compares its merge SHA to the configured deployed revision. Install
`gh` on PATH and authorize the service account to read that repository/PR.
Runtime inspection does not require push authority. Setting the revision
variable does not independently inspect the image; operators must establish
the actual deployed revision first. A later different revision needs compatible
verification work, not a falsely labelled SHA. Missing/mismatched evidence
keeps writes inactive; read-only mentoring and account links can work earlier.

Only the polling worker needs `TELEGRAM_INVENTORY_BOT_TOKEN`. Keep it in its
private secret environment, never in commands, source or chat. Use a dedicated
Inventory bot, not the repair or booking bot. From the Inventory project root:

```sh
npx spaceworks-agents telegram --mode inventory --namespace inventory --bindings dist/inventory-telegram.mjs --data-dir .data/agents-private --allow-exec
```

Match flags to web configuration. `--allow-exec` opts into loading the trusted
binding, not automatic staff confirmations. Configure the supervisor's working
directory, UID, environment, restart policy and private logs. Run one polling
consumer per bot; an existing webhook is refused. Polling uses outbound HTTPS
and needs no public inbound bot port. The HTTPS Inventory URL must be reachable
from the user's device; a phone cannot access this computer via its own localhost.

### Codex mentoring

Without `AGENTS_MENTOR=codex`, catalogue mentoring is deterministic and requires
no model key. For Luna, install/sign in to the supported local Codex CLI under
the actual web and/or worker service account and set on each handling process:

```text
AGENTS_MENTOR=codex
AGENTS_CODEX_LOCAL_PROCESS_ACK=true
AGENTS_CODEX_SCRATCH_DIR=<existing absolute directory, mode 0700>
AGENTS_CODEX_MENTOR_MODEL=gpt-6-luna
```

The process handling the request launches the CLI locally; there is no remote
model-worker RPC. Make its private CLI login/config available to that OS account;
a laptop login is not automatically present in a container. Model calls need
network access. Explicit misconfiguration fails instead of claiming AI success.
The driver restricts child environment variables, but the local read-only
sandbox is not a confidentiality boundary; isolate its account appropriately.
Code generation uses `gpt-6.1-sol` in the maintainer workflow separately. The
native runtime bot exposes no setup/source-edit capability.

### Persistent state

Mount the same private durable `.data/agents-private` directory under the
project root for web/backend and bot with the same UID and namespace. Directories
must be `0700`, journals `0600`, with no symlinks. Links, conversations and cursor
live below `telegram/<namespace>/`; back up snapshots and append-only journals
together. Keep CLI credentials/scratch private as well. Inventory stock, loans,
receipts and audit remain in PostgreSQL and use its separate backup procedure.

The default `.git/spaceworks-agents` is suitable for ordinary checkouts; use the
explicit `.data/` path for containers/worktrees. Next standalone builds exclude
`.data/` and `.git/`; runtime state must be mounted, never baked into artifacts.
This binding needs a shared filesystem; multiple regions or ephemeral serverless
instances require additional storage/integration design.

## Activation and readiness

Follow the [activation runbook](AGENTS-RUNBOOK.md) and
[private Telegram linking guide](TELEGRAM.md). Verify actual bot delivery and
restart persistence, current roles, revocation during model requests and safe
confirmed actions in a designated test tenant. The bot grants no extra role.
Manager stock operations, staff approvals and native evidence remain enforced.

As of 25 October 2026, this integration is in PR #3 awaiting human merge. Local
verification used disposable PostgreSQL and actual signed-in Luna planning.
Actual @mentortsbot account linking and Luna mentoring were delivered to a
signed-in Telegram client using synthetic catalogue stock. Normal native desk
approval and issue of demo loan LN-0010 reduced sensor availability 8 → 7;
agent operation receipts remained zero. The local app runs at localhost:4319
with a separate polling worker and signed-in Codex. This is a local development
run, not a production deployment. Production rollout, activation and the
image/service extensions above remain unverified.
