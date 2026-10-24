import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { inventoryTelegramConfig } from "@/lib/agents/telegram/config";

const directories: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map(value => rm(value, { recursive: true, force: true }))); });
async function root() {
  const value = await mkdtemp(path.join(tmpdir(), "inventory-telegram-")); directories.push(value);
  vi.stubEnv("AGENTS_TELEGRAM_DATA_DIR", ".data/private"); vi.stubEnv("AGENTS_TELEGRAM_NAMESPACE", "inventory-test");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3100"); return value;
}
describe("Telegram private configuration", () => {
  it("shares stable namespace paths between web and worker", async () => {
    const directory = await root();
    const web = await inventoryTelegramConfig(directory), worker = await inventoryTelegramConfig(directory, "inventory-test");
    expect(web).toEqual(worker); expect(web.directory).toBe(path.join(await realpath(directory), ".data/private/telegram/inventory-test"));
    await expect(inventoryTelegramConfig(directory, "another-bot")).rejects.toThrow("namespace");
  });
  it("refuses foreign paths, symlinks and nonprivate data directories", async () => {
    const directory = await root();
    for (const unsafe of ["../outside", "public/private", "frontend/public/private", ".next/static/private", "out/private", ".data/../public/private"]) {
      vi.stubEnv("AGENTS_TELEGRAM_DATA_DIR", unsafe); await expect(inventoryTelegramConfig(directory)).rejects.toThrow("private");
    }
    vi.stubEnv("AGENTS_TELEGRAM_DATA_DIR", ".data/private"); await mkdir(path.join(directory, ".data"), { mode: 0o700 }); await symlink(tmpdir(), path.join(directory, ".data/private"));
    await expect(inventoryTelegramConfig(directory)).rejects.toThrow("regular"); await rm(path.join(directory, ".data/private"));
    await mkdir(path.join(directory, ".data/private"), { mode: 0o755 }); await expect(inventoryTelegramConfig(directory)).rejects.toThrow("0700");
  });
  it("requires a trusted origin without credentials, paths or public HTTP", async () => {
    const directory = await root();
    for (const url of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?x=1"]) {
      vi.stubEnv("NEXT_PUBLIC_BASE_URL", url); await expect(inventoryTelegramConfig(directory)).rejects.toThrow("origin");
    }
  });
});
