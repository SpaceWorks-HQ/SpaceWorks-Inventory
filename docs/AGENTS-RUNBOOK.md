# Enable the Inventory agent after review

The integration PR is the review boundary. Running its branch locally proves
the code can be tested; it does not activate production stock or lending writes.

1. Review the exact PR into `dev`, its migration, permissions, model access and
   test results. A maintainer merges it. Preserve the PR number, reviewed head
   SHA and actual deployed merge revision.
2. Back up the existing Inventory database and private worker state. In the
   selected deployment, run `npm ci`, `npm run db:deploy`, `npm run build` and
   `npm run build:telegram` through the normal release process. The migration
   adds command receipts; existing stock/lending services remain authoritative.
3. Keep the normal Inventory authentication and database configuration. Set
   `NEXT_PUBLIC_BASE_URL` to the reachable trusted Inventory origin. Staff and
   inventory managers must already have active memberships in the intended space.
4. For local Codex mentoring, sign in to the installed Codex CLI as the worker
   OS account. Set `AGENTS_MENTOR=codex`,
   `AGENTS_CODEX_LOCAL_PROCESS_ACK=true`, an existing absolute mode-0700
   `AGENTS_CODEX_SCRATCH_DIR`, and
   `AGENTS_CODEX_MENTOR_MODEL=gpt-6-luna`. Code generation in the reusable
   adapter defaults to `gpt-6.1-sol`. Deterministic mentoring needs no model key.
5. Configure the separate Inventory bot and shared private storage exactly as
   [the Telegram guide](TELEGRAM.md) describes. Supply
   `TELEGRAM_INVENTORY_BOT_TOKEN` only in the worker's secret environment. Web
   and worker must use the same namespace, private volume and UID. Start the
   reviewed polling command explicitly; installation never starts it for you.
6. Independently verify the deployed revision and host health. Configure
   `AGENTS_INTEGRATION_PR`, `AGENTS_INTEGRATION_HEAD` and
   `AGENTS_VERIFIED_REVISION` with those exact verified values. The server
   independently checks the dev merge through authenticated GitHub CLI. Missing
   or mismatched verification keeps mutations inactive. Do not fabricate a
   merge or disable this check to make the bot appear ready.
7. Open **Desk → Project mentor** while signed in. Create a private one-use
   account-link code, send `/link CODE` to the Inventory bot, then use `/mentor`
   or `/ops`. Do not send the bot token, provider keys or passwords to the bot.
8. Tag actual catalogue items with verified discussion metadata such as
   `capability:temperature`, `interface:i2c` and `voltage:3.3v`. Mentoring reads
   current stock and offers alternatives and native item links. Check the actual
   datasheet, condition, compatibility and quantities before requesting items.

Stock receipts and adjustments remain inventory-manager operations. Loan
requests/approvals follow current host roles and policy; payment, physical QR
scans and required photos stay on the native desk. A suggestion never issues
hardware. Confirmation, policy versions, transactional command receipts and
audit still apply after activation. Unlinking or membership changes revoke
access, including results from model requests that were already in flight.

The demonstrated database is disposable synthetic data. No production stock,
live Telegram delivery, payment or physical handover was used in verification.
The operator must verify actual delivery and service supervision after supplying
their bot configuration. Existing dependency advisories are recorded in the PR;
they are not hidden by a passing domain test suite.
