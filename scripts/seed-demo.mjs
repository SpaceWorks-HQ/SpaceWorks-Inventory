#!/usr/bin/env node
// Seeds two demo makerspaces ("TinkerSpace Kochi", "Maker Lab Thrissur") with
// people in every role, the sample inventory, loans in every state, a transfer
// in transit and an open count, for local development, demos and screenshots.
// Refuses to run with NODE_ENV=production.
//
//   DEMO_PASSWORD=... node --env-file-if-exists=.env scripts/seed-demo.mjs
//
// The TypeScript entry (scripts/seed/demo.ts) uses the real domain services,
// bundled on the fly with esbuild like the worker and beat.
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.NODE_ENV === "production") throw new Error("seed-demo is for local development only.");
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) to seed the demo accounts.");

const root = path.resolve(import.meta.dirname, "..");
// Inside the project so the bundle resolves node_modules (Prisma, bcrypt) normally.
const out = path.join(root, ".data", `seed-${process.pid}`);
mkdirSync(out, { recursive: true });
try {
  await build({
    entryPoints: [path.join(root, "scripts/seed/demo.ts")],
    outfile: path.join(out, "demo.mjs"),
    bundle: true, platform: "node", target: "node22", format: "esm",
    external: ["@prisma/client", "sharp", "bcryptjs"],
    alias: { "@": root },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    plugins: [{ name: "server-boundary", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      builder.onResolve({ filter: /^next\/(headers|navigation|cache)$/ }, (args) => ({ path: args.path, namespace: "empty" }));
      builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export const headers = () => { throw new Error('No request.'); }; export const revalidatePath = () => {};", loader: "js" }));
    } }],
    nodePaths: [path.join(root, "node_modules")],
    logLevel: "warning",
  });
  const { seedDemo } = await import(pathToFileURL(path.join(out, "demo.mjs")).href);
  const result = await seedDemo(password);
  console.log(`Seeded ${result.spaces.join(", ")}. Sign in as:\n  ${result.users.join("\n  ")}\nwith DEMO_PASSWORD.`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
// Prisma keeps the process alive otherwise.
process.exit(0);
