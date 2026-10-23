import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = process.cwd();
const base = path.join(root, "tmp");
const fixtures: string[] = [];

function fixture(files: Record<string, string>) {
  mkdirSync(base, { recursive: true });
  const directory = mkdtempSync(path.join(base, "frontend-scripts-"));
  fixtures.push(directory);
  for (const [file, source] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    writeFileSync(path.join(directory, file), source);
  }
  mkdirSync(path.join(directory, "scripts"), { recursive: true });
  for (const name of ["prepare-frontend.mjs", "check-frontend-boundary.mjs", "frontend-render-declarations.mjs"]) {
    cpSync(path.join(root, "scripts", name), path.join(directory, "scripts", name));
  }
  return directory;
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    expect(path.dirname(directory)).toBe(base);
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("split frontend scripts", () => {
  it("prepares an empty facade directory without skipping any source walks", () => {
    const directory = fixture({
      "app/globals.css": '@import "tailwindcss";',
      "components/label.ts": 'export const label = "Label";',
      "lib/example.ts": 'export const example = "Example";',
      "public/example.txt": "Example",
      "postcss.config.mjs": "export default {};",
      "frontend/catalog.json": '{"actions":[],"readers":[]}',
      "frontend/pages.json": "[]",
      "frontend/pure-exports.json": "{}",
      "frontend/model-types.json": "[]",
      "frontend/api-route.ts": "export const GET = () => new Response();",
      "frontend/storage.ts": "export const storage = {};",
    });
    const output = execFileSync(process.execPath, ["scripts/prepare-frontend.mjs"], { cwd: directory, encoding: "utf8" });
    expect(output).toContain("Frontend space prepared");
    expect(existsSync(path.join(directory, "frontend/lib/frontend/pure"))).toBe(true);
    expect(readFileSync(path.join(directory, "frontend/app/globals.css"), "utf8")).toContain('@source "../components";');
  });

  it("checks real pages and rejects backend imports outside the pure export list", () => {
    const directory = fixture({
      "app/page.tsx": 'import { load } from "@/lib/mixed"; export default function Page() { return load(); }',
      "lib/db.ts": "export const prisma = {};",
      "lib/mixed/index.ts": 'import { prisma } from "@/lib/db"; export const label = "Label"; export function load() { return prisma; }',
      "frontend/catalog.json": '{"actions":[],"readers":[]}',
      "frontend/pages.json": "[]",
      "frontend/pure-exports.json": '{"lib/mixed":["label"]}',
    });
    const run = () => spawnSync(process.execPath, ["scripts/check-frontend-boundary.mjs"], { cwd: directory, encoding: "utf8" });
    const rejected = run();
    expect(rejected.status).toBe(1);
    expect(rejected.stdout).toContain("lib/db");
    expect(rejected.stderr).toContain("1 frontend page(s) reach lib/db");
    writeFileSync(path.join(directory, "app/page.tsx"), 'import { label } from "@/lib/mixed"; export default function Page() { return label; }');
    const allowed = run();
    expect(allowed.status).toBe(0);
    expect(allowed.stdout).toBe("Frontend boundary: no page reaches lib/db.\n");
  });
});
