import { expect, test, type Page } from "@playwright/test";

export const SPACE = "/s/tinkerspace-kochi";
export const DEMO = { owner: "anjali", admin: "rahul", manager: "meera", staff: "joel", member: "fathima", member2: "vivek", member3: "nisha" } as const;

/** Skip a spec unless the demo seed ran (DEMO_PASSWORD set). */
export function needsDemo() {
  test.skip(!process.env.DEMO_PASSWORD || process.env.PLAYWRIGHT_SPLIT === "1", "Set DEMO_PASSWORD to seed and use the demo makerspaces.");
}

export async function signIn(page: Page, who: string, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await page.getByLabel("Email", { exact: true }).fill(`${who}@tinkerspace.test`);
  await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(callbackUrl ? `**${callbackUrl}` : "**/s/**");
}

/** No horizontal page scroll at the current viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

/** A tiny valid PNG for photo evidence uploads. */
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC", "base64");
