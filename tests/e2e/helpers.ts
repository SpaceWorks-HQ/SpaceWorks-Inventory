import "./localEnv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

export const SPACE = "/s/tinkerspace-kochi";
export const DEMO = { owner: "anjali", admin: "rahul", manager: "meera", staff: "joel", member: "fathima", member2: "vivek", member3: "nisha" } as const;

/** Skip a spec unless the demo seed ran (DEMO_PASSWORD set). */
export function needsDemo() {
  test.skip(!process.env.DEMO_PASSWORD, "Demo journeys require DEMO_PASSWORD; use --external-services --demo in the hosting harness.");
}

const AUTH_DIR = path.resolve(".data/e2e-auth");
let signIns = 0;

/**
 * Sign in as a demo account. Sessions are cached per account for the run
 * (the global setup clears them). Each fresh sign-in also comes from its own
 * client address (the test server trusts `x-real-ip`, see playwright.config.ts),
 * so the suite stays under the per-address sign-in limit; the per-account
 * limit still applies.
 */
export async function signIn(page: Page, who: string, callbackUrl?: string) {
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.${(process.pid >> 8) & 255}.${process.pid & 255}.${(signIns++ % 250) + 1}` });
  const file = path.join(AUTH_DIR, `${who}.json`);
  if (existsSync(file)) {
    await page.context().addCookies(JSON.parse(readFileSync(file, "utf8")));
    await page.goto(callbackUrl ?? SPACE);
    if (!new URL(page.url()).pathname.startsWith("/login")) return;
  }
  // A journey may switch roles before that account has a cached session.
  // The login page redirects authenticated users, so drop the previous role.
  await page.context().clearCookies();
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await page.getByLabel("Email", { exact: true }).fill(`${who}@tinkerspace.test`);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(callbackUrl ? `**${callbackUrl}` : "**/s/**");
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(await page.context().cookies()), { mode: 0o600 });
}

/** No horizontal page scroll at the current viewport (a failure names the page and the overflow). */
export async function expectNoHorizontalScroll(page: Page) {
  const { overflow, culprit } = await page.evaluate(() => {
    // The outermost element that crosses the right edge while its parent doesn't.
    const crosses = (el: Element | null) => Boolean(el && el.getBoundingClientRect().right > window.innerWidth + 1);
    const el = [...document.body.querySelectorAll("*")].find((node) => crosses(node) && !crosses(node.parentElement) && node.getBoundingClientRect().width > 0);
    const describe = el ? `<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 120)}"> "${(el.textContent ?? "").trim().slice(0, 40)}"` : "none";
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, culprit: describe };
  });
  expect(overflow, `${new URL(page.url()).pathname} scrolls sideways by ${overflow}px; first culprit ${culprit}`).toBeLessThanOrEqual(1);
}

/** A tiny valid PNG for photo evidence uploads. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");

/**
 * Deliver queued email now, the way the free-hosting cron does
 * (`POST /api/internal/outbox?run=inline`), instead of waiting up to a minute
 * for the development worker's next run.
 */
export async function deliverOutbox(request: APIRequestContext) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  await request.post("/api/internal/outbox?run=inline", { headers: { authorization: `Bearer ${secret}` } });
}
