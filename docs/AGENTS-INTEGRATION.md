# Project mentor and staff operations adapter

Space Works Inventory embeds SpaceWorks Agents against this application's own
authentication, memberships, PostgreSQL catalogue, stock and lending workflows.
It does not use the Agents demonstration ledger.

Staff and inventory managers open **Desk → Project mentor** at
`/s/<spaceSlug>/mentor`. Describe the project, outcome, controller, power,
interfaces and constraints. The mentor compares current authorized stock and
alternatives, asks compatibility questions and links to the native item page.
Planning does not consume, reserve, request, approve or issue stock.

Inventory managers maintain explicit item tags such as
`capability:temperature`, `capability:humidity`, `interface:i2c` and
`voltage:3.3v`. Untagged items are not treated as verified sensing capability
evidence. Tags remain discussion evidence; verify the actual manufacturer's
datasheet and physical part before selection.

## Endpoints and access

The cookie-authenticated Node.js boundary is
`/api/ops/v1/<spaceSlug>/...`. Every request reloads an enabled user and active
space membership; unknown/foreign/archived spaces use the same not-found.
Writes require the configured Inventory origin and rate limits. The helper
accepts only reviewed operation fields, a unique action key, explicit
confirmation and the snapshot's current policy version.

- `GET health`, `status`, `snapshot`, `capabilities` and `discovery`.
- `POST mentor/plan`: STAFF or MANAGER, read-only project planning.
- `POST operations/stock.receive`: MANAGER, actual item/location/quantity.
- `POST operations/stock.adjust`: MANAGER, actual item/location/delta/reason.
- `POST operations/lending.request`: member's own loan, or STAFF/MANAGER
  request for an active member; `memberId` means a membership id, not user id.
- `POST operations/lending.approve`: STAFF or MANAGER; native holds and fees.

The adapter does not advertise direct consume, issue, return, generic task
completion or policy replacement. Existing native pages provide those supported
workflows under their own guards. A mentor candidate offers a native app handoff
instead of substituting a generic inventory operation.

## Merge and deployed revision gate

Mutations remain inactive until an operator sets `AGENTS_INTEGRATION_PR` to the
reviewed Inventory PR number, `AGENTS_INTEGRATION_HEAD` to its exact head SHA,
and `AGENTS_VERIFIED_REVISION` to the verified deployed merge revision. The
server uses authenticated GitHub CLI to independently confirm that exact PR
merged into `dev`; missing CLI/authentication, mismatched revisions and review
outages fail closed. These values are deployment configuration, never request
arguments. The local mentor remains available before merge because it is
read-only. A branch running locally does not prove a reviewed integration is
activated.

Every successful command creates an `AgentOperationReceipt` in the same
transaction as its native domain effects and audit. Repeating the same actor,
space and action key replays the saved result. Reusing it for different reviewed
inputs is refused. Membership and policy are rechecked; stock math, reservations
and loan transitions remain owned by the existing availability/workflow modules.

## Local Codex mentor

The default is deterministic catalogue planning. To opt into the installed,
authenticated Codex CLI, the operator sets `AGENTS_MENTOR=codex`,
`AGENTS_CODEX_LOCAL_PROCESS_ACK=true`, `AGENTS_CODEX_SCRATCH_DIR` to an existing
absolute private directory (mode 0700), and optionally
`AGENTS_CODEX_MENTOR_MODEL` (default `gpt-6-luna`). The application code is built
with Codex assistance; code generation and runtime mentoring are separate jobs.

The model receives project requirements and an allowed capability vocabulary,
not database credentials or authority to execute operations. Its structured
draft is validated and matched back to real catalogue availability. Local CLI
means a local process using its configured model service; it is not an offline
model. A separate operator-controlled worker identity is recommended.

## Evidence, Telegram and honest limits

Issuing and returning still use the existing authenticated lending desk. Every
serialized unit/container needs its real QR scan, and at least
`Space.minEvidencePhotos` decoded, tenant-bound photos are required. Return
remarks are always mandatory. The adapter never invents scans, uploads or proof.

This change does not activate a Telegram bot or create account links. The
optional inventory bot must be configured with a trusted host account-link
implementation; recheck current users/memberships on every message. Repair
technician messaging credentials are a separate feature and are not silently
reused. External payments, email delivery and hardware handovers are not
demonstrated by local fixture tests.
