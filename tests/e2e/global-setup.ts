import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const SPACE = "/s/tinkerspace-kochi";
// Every route the journeys open, compiled before any browser connects: a dev
// server compiling on demand while a page is open answers with Fast Refresh
// reloads that detach the page mid-test.
const ROUTES = ["/login", "/", "/c/tinkerspace-kochi", "/login/link/warm-up", SPACE, ...[
  "items", "items/new", "items/warm-up", "stock", "locations", "kits", "reports", "members", "settings", "settings/inventory",
  "settings/integrations", "purchases", "audit", "loans", "loans/warm-up", "my-loans", "my-loans/warm-up", "catalogue",
  "catalogue/self-checkout", "transfers", "transfers/new", "transfers/warm-up", "counts", "counts/new", "counts/warm-up", "scan", "notifications",
].map((path) => `${SPACE}/${path}`)];

/** Re-seed the demo makerspaces before the run when a demo password is given (never in production). */
export default async function globalSetup() {
  if (!process.env.DEMO_PASSWORD || process.env.NODE_ENV === "production" || process.env.PLAYWRIGHT_SPLIT === "1") return;
  // Cached demo sessions belong to the previous seed.
  rmSync(".data/e2e-auth", { recursive: true, force: true });
  execFileSync(process.execPath, ["--env-file-if-exists=.env", "scripts/seed-demo.mjs"], { stdio: "inherit", env: { ...process.env } });
  if (process.env.PLAYWRIGHT_SERVER_COMMAND || process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1") return;
  const base = `http://127.0.0.1:${Number(process.env.PLAYWRIGHT_PORT || 3100)}`;
  for (const route of ROUTES) {
    await fetch(new URL(route, base), { redirect: "manual", signal: AbortSignal.timeout(180_000) }).then((response) => response.body?.cancel()).catch(() => undefined);
  }
  await delay(3_000);
}
