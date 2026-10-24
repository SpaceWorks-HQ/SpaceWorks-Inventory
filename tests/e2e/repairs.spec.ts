import * as OTPAuth from "otpauth";
import { expect, test, type Page } from "@playwright/test";
import { pendingRepairLink } from "./demoDb";
import { DEMO, SPACE, needsDemo, signIn } from "./helpers";

needsDemo();

/** Must match DEMO_TECHNICIAN_TOTP_SECRET in scripts/seed/repairs.ts (development only). */
const TOTP = new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32("JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP") });

/** The demo technician signs in with a password and an authenticator code (a fresh code per try: codes work once). */
async function signInTechnician(page: Page) {
  await page.context().clearCookies();
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.77.${process.pid & 255}.9` });
  await page.goto(`/login?callbackUrl=${encodeURIComponent(`${SPACE}/repairs`)}`);
  await expect(async () => {
    if (!new URL(page.url()).pathname.startsWith("/login")) return;
    if (!(await page.getByLabel("Verification code").isVisible())) {
      await page.getByLabel("Email", { exact: true }).fill("arun@tinkerspace.test");
      await page.getByLabel("Password", { exact: true }).fill(process.env.DEMO_PASSWORD!);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByLabel("Verification code")).toBeVisible({ timeout: 10_000 });
    }
    // Wait for a code step nobody used yet.
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
    await page.getByLabel("Verification code").fill(TOTP.generate());
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await page.waitForURL(`**${SPACE}/repairs`, { timeout: 15_000 });
  }).toPass({ timeout: 120_000 });
}

const openRepair = async (page: Page, title: RegExp) => {
  await page.goto(`${SPACE}/repairs`);
  await page.getByRole("row", { name: title }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
};

test("a member technician accepts a request, records the fix and a manager verifies it", async ({ page }) => {
  test.setTimeout(240_000);
  await signInTechnician(page);
  // Technicians only see repairs: other pages answer not-found.
  expect((await page.goto(`${SPACE}/items`))?.status()).toBe(404);
  expect((await page.goto(`${SPACE}/finance`))?.status()).toBe(404);
  await openRepair(page, /Damaged on loan/);
  await page.getByRole("button", { name: "Accept the repair" }).click();
  await expect(page.getByText("Being repaired").first()).toBeVisible();
  await page.getByLabel("What you did").fill("Replaced the two missing bits and tightened the case hinge.");
  await page.getByLabel(/Amount you ask/).fill("350");
  await page.getByRole("button", { name: "Mark it fixed" }).click();
  await expect(page.getByText("Fixed, to verify").first()).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, DEMO.manager, `${SPACE}/repairs`);
  await openRepair(page, /Damaged on loan/);
  await page.getByRole("button", { name: "Verify and close" }).click();
  await page.getByRole("button", { name: "Verify and close" }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
});

test("an external technician works through their link and the manager pays them", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const since = new Date(Date.now() - 5_000);
  await signIn(page, DEMO.manager, `${SPACE}/repairs`);
  await openRepair(page, /Blade wobbles/);
  await page.getByRole("checkbox", { name: "Suresh Electricals" }).click();
  await page.getByRole("button", { name: "Send the request" }).click();
  await expect(page.getByText("Waiting for an answer").first()).toBeVisible();
  let link: string | null = null;
  await expect(async () => { link = await pendingRepairLink("suresh@tinkerspace.test", since); expect(link).not.toBeNull(); }).toPass({ timeout: 15_000 });

  // No account: the link is the only key, and it shows nothing but the job.
  const outside = await browser.newContext();
  const tech = await outside.newPage();
  await tech.goto(new URL(link!).pathname);
  await expect(tech.getByText("Blade wobbles at high speed")).toBeVisible();
  await tech.getByRole("button", { name: "Accept the repair" }).click();
  await tech.getByLabel("What you did").fill("Replaced the blade clamp and checked the guide roller.");
  await tech.getByLabel(/Amount you ask/).fill("1200");
  await tech.getByRole("button", { name: "Mark it fixed" }).click();
  await expect(tech.getByText("You marked it fixed.")).toBeVisible();
  await outside.close();

  await openRepair(page, /Blade wobbles/);
  await page.getByRole("button", { name: "Verify and close" }).click();
  await page.getByRole("button", { name: "Verify and close" }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve amount" }).click();
  await page.getByLabel("Reference").fill("UPI-E2E-7781");
  await page.getByRole("button", { name: "Record payout" }).click();
  await expect(page.getByText(/UPI-E2E-7781/)).toBeVisible();

  await page.goto(`${SPACE}/finance`);
  await expect(page.getByRole("heading", { name: "Finance", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Repair payout" }).first()).toBeVisible();

  // Money is for inventory managers only.
  await page.context().clearCookies();
  await signIn(page, DEMO.staff, `${SPACE}/repairs`);
  await expect(page.getByText("Staff", { exact: true }).first()).toBeVisible();
  expect((await page.goto(`${SPACE}/finance`))?.status()).toBe(404);
  expect((await page.goto(`${SPACE}/finance/export?format=csv`))?.status()).toBe(404);
  expect((await page.goto(`${SPACE}/repairs/payouts`))?.status()).toBe(404);
});
