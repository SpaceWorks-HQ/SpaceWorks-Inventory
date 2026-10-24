# Inventory Telegram worker

The Inventory bot uses the real Inventory adapter, catalogue and native desk
handoffs. It shares the web helper's `inventoryAgentActivation`: human review
and merge of the exact integration PR to `dev`, followed by verified deployed
revision configuration, are required for business writes. Linking grants no new
role. An unmerged integration can link accounts but cannot execute operations.
No bot token is bundled, and no worker starts during installation or build.

## Operator configuration

Use a separate BotFather bot for Inventory. Never reuse repair, booking or other
application bot credentials. Supply `TELEGRAM_INVENTORY_BOT_TOKEN` only in the
worker secret environment. Do not paste tokens into chat, commands or source.

Configure both the web process and worker with identical values:

- `AGENTS_TELEGRAM_NAMESPACE=inventory` (choose a distinct name per deployment).
- `AGENTS_TELEGRAM_DATA_DIR=.git/spaceworks-agents` (default; root-relative).
- `NEXT_PUBLIC_BASE_URL` set to the trusted HTTPS Inventory origin; loopback HTTP
  is allowed for local development.

Storage stays under `.git/` or `.data/` in the selected Inventory root; source
and other tracked directories are rejected. The data directory and every
child must have mode `0700`, with no symlinks; journal files use `0600`. Do not
store runtime state in tracked files or logs. Web and worker must share the same
private durable volume, mounted at this root-relative path, with the same
namespace and UID. In containers without `.git`, explicitly configure a private
ignored path such as `.data/agents-private`. Back up journals with snapshots.
Run only one polling consumer per bot. Polling refuses an existing webhook.

For model mentoring, the native adapter uses the local Codex Luna runtime:
`AGENTS_MENTOR=codex`, `AGENTS_CODEX_LOCAL_PROCESS_ACK=true`, and a private
`AGENTS_CODEX_SCRATCH_DIR`. The default `AGENTS_CODEX_MENTOR_MODEL` is
`gpt-6-luna`; configure the installed CLI/runtime through the host's documented
operator setup. This opt-in permits a local subprocess under the worker's OS
permissions. Do not claim a live model run from deterministic tests.

Build the reviewed module, then explicitly opt in to loading it from the
Inventory repository root:

```sh
npm run build:telegram
npx spaceworks-agents telegram --mode inventory --namespace inventory --bindings dist/inventory-telegram.mjs --data-dir .git/spaceworks-agents --allow-exec
```

Match `--namespace` and `--data-dir` to the web configuration. The launcher owns
persistent conversation and delivery-cursor stores alongside `links`, retries
uncertain delivery against its durable cursor, and stops on SIGINT/SIGTERM.
Use a trusted supervisor for continued operation. There is no automatic
production activation or token provisioning.

## Account owner workflow

On the private Project mentor page, select **Create private link code** while
signed in to the intended space. Send the displayed `/link CODE` only in your
own private Inventory bot conversation. Codes expire after five minutes, can be
used once, and only their hashes are persisted. Creating a code invalidates
older unused codes for that account in that space. A Telegram identity links
to one host account/space at a time; issue a fresh code to switch.

Select **Revoke Telegram access** to remove that account's links and unused
codes in this space. Requests use the authenticated web session and same-origin
protection; request bodies cannot select an actor or space. Membership, current
role, enabled account and unarchived space are re-read on every bot update.
Suspension, removal, disabling and technician-only membership deny access.
Role or tenant changes invalidate historical chat reviews.

Use `/status`, `/mentor`, `/ops` and `/cancel`. Staff/managers can mentor; other
operations follow the native advertised role matrix. Suggestions use current
catalogue availability and link back to native item pages. They change no stock
or loans. Approvals, payments, QR scans and evidence remain native workflows.
The bot cannot install an integration or impersonate a setup maintainer.

Tests mock Telegram transport and local model execution. A real bot token,
private-chat account linking, supervisor delivery, and deployed merge probe
still require operator verification before production use.
