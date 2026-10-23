import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Locally the journeys read two values from the same settings file as
// `npm run dev`: DATABASE_URL (label codes) and CRON_SECRET (deliver queued
// email). Only these: DEMO_PASSWORD must come from the command line, so the
// global setup seeds whenever the journeys run. CI and the hosting harness
// pass both as environment variables instead.
const file = ".env";
if (existsSync(file)) {
  const values = parseEnv(readFileSync(file, "utf8"));
  for (const key of ["DATABASE_URL", "CRON_SECRET"]) {
    if (!process.env[key] && values[key]) process.env[key] = values[key];
  }
}

export {};
