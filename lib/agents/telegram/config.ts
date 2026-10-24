import "server-only";
import path from "node:path";
import { lstat, mkdir, realpath } from "node:fs/promises";

/** Identical operator configuration is required in the web app and polling worker. */
export async function inventoryTelegramConfig(root = process.cwd(), namespace?: string) {
  const configured = process.env.AGENTS_TELEGRAM_NAMESPACE ?? "inventory";
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(configured) || (namespace !== undefined && namespace !== configured)) throw new Error("Configure a matching Inventory Telegram namespace.");
  // The private mounted volume is runtime state, never a deployment artifact.
  const base = await realpath(/* turbopackIgnore: true */ root);
  const relative = process.env.AGENTS_TELEGRAM_DATA_DIR ?? ".git/spaceworks-agents";
  if (path.isAbsolute(relative) || !/^(?:\.git|\.data)\//.test(relative) || relative.split(/[\\/]/).includes("..")) throw new Error("Keep Telegram storage inside a private .git/ or .data/ directory.");
  const target = path.resolve(base, relative);
  const rel = path.relative(base, target);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Telegram storage must stay inside the selected Inventory root.");
  let cursor = base;
  for (const part of path.join(rel, "telegram", configured).split(path.sep)) {
    cursor = path.join(cursor, part);
    await mkdir(cursor, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Telegram storage requires regular private directories.");
    // Existing .git is host-owned; every directory below the configured data root must be private.
    if ((cursor === target || cursor.startsWith(target + path.sep)) && (stat.mode & 0o077)) throw new Error("Set Telegram storage directory permissions to 0700.");
  }
  const url = new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "");
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Configure an HTTPS or loopback HTTP Inventory origin.");
  return { namespace: configured, directory: cursor, hostUrl: url.origin };
}
