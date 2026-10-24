// Operator-only README screenshot capture against the seeded demo
// (`DEMO_PASSWORD=... npm run db:seed:demo`). Never point it at production.
//
//   DEMO_PASSWORD=... node scripts/capture-readme-screens.mjs http://localhost:3300
//
// Every screen is captured in light and dark mode as WebP under docs/screenshots/.
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const base = new URL(process.argv[2] || "http://localhost:3300");
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Use an HTTP(S) base URL without credentials.");
const password = process.env.DEMO_PASSWORD;
if (!password) throw new Error("Set DEMO_PASSWORD to the seeded demo password.");
const out = path.resolve(import.meta.dirname, "../docs/screenshots");
await mkdir(out, { recursive: true });
const space = "/s/tinkerspace-kochi";

/** [file name, demo account, route or resolver, viewport] */
const SCREENS = [
  ["home", "joel", space],
  ["loans", "joel", `${space}/loans`],
  ["loan-issue", "joel", async (page) => firstLink(page, `${space}/loans?tab=ready`, `${space}/loans/`)],
  ["items", "meera", `${space}/items`],
  ["item", "meera", async (page) => firstLink(page, `${space}/items?q=Multimeter`, `${space}/items/`)],
  ["stock", "meera", `${space}/stock`],
  ["locations", "meera", `${space}/locations`],
  ["transfer", "meera", async (page) => firstLink(page, `${space}/transfers`, `${space}/transfers/`)],
  ["counts", "meera", `${space}/counts`],
  ["reports", "meera", `${space}/reports`],
  ["repairs", "meera", `${space}/repairs`],
  ["repair", "meera", async (page) => firstLink(page, `${space}/repairs/payouts`, `${space}/repairs/c`)],
  ["finance", "meera", `${space}/finance`],
  ["catalogue", "fathima", `${space}/catalogue`],
  ["my-loans", "fathima", `${space}/my-loans`],
  ["settings-fees", "anjali", `${space}/settings?tab=fees`],
  ["settings-payments", "anjali", `${space}/settings/payments`],
  ["members", "anjali", `${space}/members`],
  ["public-catalogue", null, "/c/tinkerspace-kochi"],
  ["scan-phone", "joel", `${space}/scan`, { width: 390, height: 844 }],
];

async function firstLink(page, listRoute, prefix) {
  await page.goto(new URL(listRoute, base).href, { waitUntil: "load" });
  const href = await page.locator(`main a[href^="${prefix}"]`).first().getAttribute("href");
  if (!href) throw new Error(`No link under ${prefix} on ${listRoute}. Seed the demo first.`);
  return href;
}

const browser = await chromium.launch();
// One sign-in per demo account, reused for its later screens (stays under the sign-in rate limit).
const sessions = new Map();
try {
  for (const [name, who, target, viewport] of SCREENS) {
    const context = await browser.newContext({ viewport: viewport ?? { width: 1440, height: 900 }, deviceScaleFactor: viewport ? 2 : 1, reducedMotion: "reduce", storageState: who ? sessions.get(who) : undefined });
    const page = await context.newPage();
    if (who && !sessions.has(who)) {
      await page.goto(new URL("/login", base).href);
      await page.getByLabel("Email", { exact: true }).fill(`${who}@tinkerspace.test`);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForURL(/\/s\//);
      sessions.set(who, await context.storageState());
    }
    const route = typeof target === "function" ? await target(page) : target;
    for (const mode of ["light", "dark"]) {
      await context.addCookies([{ name: "swi.color-mode", value: mode, url: base.origin }]);
      await page.emulateMedia({ colorScheme: mode });
      const response = await page.goto(new URL(route, base).href, { waitUntil: "load" });
      if (!response?.ok() || new URL(page.url()).pathname === "/login") throw new Error(`Could not capture ${name}: the page did not load.`);
      await page.locator("main").first().waitFor({ state: "visible" });
      await page.waitForLoadState("networkidle");
      await page.evaluate((m) => { document.documentElement.dataset.colorMode = m; localStorage.setItem("swi:color-mode", m); }, mode);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await page.screenshot({ fullPage: false, animations: "disabled" });
      const file = `${name}${mode === "dark" ? "-dark" : ""}.webp`;
      await sharp(png).webp({ quality: 86 }).toFile(path.join(out, file));
      console.log(`Saved ${file}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
