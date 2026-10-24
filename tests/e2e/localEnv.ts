import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

// Locally the journeys read DATABASE_URL (label codes, pending sign-in links,
// settings a journey sets up) from the same settings file as `npm run dev`.
// Only that: DEMO_PASSWORD must come from the command line, so the global
// setup seeds whenever the journeys run. CI and the hosting harness pass it
// as an environment variable instead.
const file = ".env";
if (existsSync(file)) {
  const values = parseEnv(readFileSync(file, "utf8"));
  for (const key of ["DATABASE_URL"]) {
    if (!process.env[key] && values[key]) process.env[key] = values[key];
  }
}

export {};
