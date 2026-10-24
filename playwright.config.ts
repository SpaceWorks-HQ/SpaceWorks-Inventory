import { defineConfig, devices } from "@playwright/test";

// Locally: start `npm run dev` (any port), then
//   PLAYWRIGHT_PORT=<port> DEMO_PASSWORD=... npm run test:e2e
// The global setup re-seeds the demo spaces when DEMO_PASSWORD is set; specs
// that need them skip otherwise (the CI hosting harness runs on an empty database).
const testPort = Number(process.env.PLAYWRIGHT_PORT || 3100);
const testBaseUrl = `http://127.0.0.1:${testPort}`;
const productionServer = process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1";
const defaultServerCommand = productionServer ? "node .next/standalone/server.js" : "npm run dev";
// The server Playwright starts (any OS shell): its own origin and the per-test
// client address from tests/e2e/helpers.ts. The development server also writes
// email to .data/mail for the magic-link journey and keeps rate limits and jobs
// in the process (no Redis), so counters from an earlier run never leak into
// this one; production refuses those settings, so it keeps its own.
// A custom PLAYWRIGHT_SERVER_COMMAND sets its own environment.
const defaultServerEnv = {
  PORT: String(testPort),
  AUTH_URL: testBaseUrl,
  NEXT_PUBLIC_BASE_URL: testBaseUrl,
  TRUSTED_PROXY_IP_HEADER: "x-real-ip",
  ...(productionServer ? {} : { SMTP_HOST: "", REDIS_URL: "", JOBS_INPROCESS: "true" }),
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  use: {
    baseURL: testBaseUrl,
    trace: "on-first-retry",
    ...(process.env.PLAYWRIGHT_SPLIT === "1" ? { extraHTTPHeaders: { Origin: testBaseUrl, "x-real-ip": "127.0.0.1" } } : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.PLAYWRIGHT_SERVER_COMMAND || defaultServerCommand,
    ...(process.env.PLAYWRIGHT_SERVER_COMMAND ? {} : { env: defaultServerEnv }),
    url: `${testBaseUrl}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
