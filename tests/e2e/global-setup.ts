import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Re-seed the demo makerspaces before the run when a demo password is given (never in production). */
export default function globalSetup() {
  if (!process.env.DEMO_PASSWORD || process.env.NODE_ENV === "production" || process.env.PLAYWRIGHT_SPLIT === "1") return;
  // Cached demo sessions belong to the previous seed.
  rmSync(".data/e2e-auth", { recursive: true, force: true });
  execFileSync(process.execPath, ["--env-file-if-exists=.env", "scripts/seed-demo.mjs"], { stdio: "inherit", env: { ...process.env } });
}
