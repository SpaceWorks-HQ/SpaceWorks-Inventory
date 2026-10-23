import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { DEMO, deliverOutbox, needsDemo, signIn } from "./helpers";

needsDemo();

/** The newest sign-in link email to `to` (dev servers without SMTP write to .data/mail). */
function latestMailTo(to: string, since: number) {
  const dir = path.resolve(".data/mail");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).map((name) => path.join(dir, name)).filter((file) => statSync(file).mtimeMs >= since)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Other notices to the same person (seeded loan emails) can land in the same delivery batch.
    if (text.startsWith(`To: ${to}\n`) && text.includes("/login/link/")) return text;
  }
  return null;
}

test("password sign-in reaches the space and refuses a wrong password", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${DEMO.staff}@tinkerspace.test`);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Wrong email or password", { exact: false })).toBeVisible();
  await signIn(page, DEMO.staff);
  await expect(page).toHaveURL(/\/s\/tinkerspace-kochi/);
});

test("an emailed magic link signs in once", async ({ page, browser }) => {
  // The server playwright.config.ts starts writes email to .data/mail; a custom
  // server (the hosting harness) sends it over SMTP instead.
  test.skip(Boolean(process.env.PLAYWRIGHT_SERVER_COMMAND), "Reads .data/mail, which only the default test server writes.");
  const started = Date.now() - 1000;
  const email = `${DEMO.member3}@tinkerspace.test`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link", exact: true }).click();
  await expect(page.getByText("sign-in link is on its way", { exact: false })).toBeVisible();
  let mail: string | null = null;
  await expect.poll(async () => {
    await deliverOutbox(page.request);
    return (mail = latestMailTo(email, started));
  }, { timeout: 30_000 }).not.toBeNull();
  const link = mail!.match(/https?:\/\/\S+\/login\/link\/\S+/)![0];
  const url = new URL(link);
  const fresh = await browser.newContext();
  const visitor = await fresh.newPage();
  await visitor.goto(`${url.pathname}${url.search}`);
  await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
  await visitor.waitForURL(/\/s\//);
  // The same link cannot be used twice.
  const again = await (await browser.newContext()).newPage();
  await again.goto(`${url.pathname}${url.search}`);
  await again.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(again.getByText("expired or was already used", { exact: false })).toBeVisible();
  await fresh.close();
});

test("members never see staff pages", async ({ page }) => {
  await signIn(page, DEMO.member);
  const response = await page.goto("/s/tinkerspace-kochi/items");
  expect(response?.status()).toBe(404);
  const other = await page.goto("/s/maker-lab-thrissur");
  expect(other?.status()).toBe(404);
});
