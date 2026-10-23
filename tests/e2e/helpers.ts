import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

export const SPACE = "/s/tinkerspace-kochi";
export const DEMO = { owner: "anjali", admin: "rahul", manager: "meera", staff: "joel", member: "fathima", member2: "vivek", member3: "nisha" } as const;

/** Skip a spec unless the demo seed ran (DEMO_PASSWORD set). */
export function needsDemo() {
  test.skip(!process.env.DEMO_PASSWORD || process.env.PLAYWRIGHT_SPLIT === "1", "Set DEMO_PASSWORD to seed and use the demo makerspaces.");
}

const AUTH_DIR = path.resolve(".data/e2e-auth");

/**
 * Sign in as a demo account. Sessions are cached per account for the run
 * (the global setup clears them), so the suite stays under the sign-in rate
 * limit of a single test client.
 */
export async function signIn(page: Page, who: string, callbackUrl?: string) {
  const file = path.join(AUTH_DIR, `${who}.json`);
  if (existsSync(file)) {
    await page.context().addCookies(JSON.parse(readFileSync(file, "utf8")));
    await page.goto(callbackUrl ?? SPACE);
    if (!new URL(page.url()).pathname.startsWith("/login")) return;
  }
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await page.getByLabel("Email", { exact: true }).fill(`${who}@tinkerspace.test`);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(callbackUrl ? `**${callbackUrl}` : "**/s/**");
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(await page.context().cookies()), { mode: 0o600 });
}

/** No horizontal page scroll at the current viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** A tiny valid PNG for photo evidence uploads. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");
