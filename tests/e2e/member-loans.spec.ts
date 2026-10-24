import { expect, test } from "@playwright/test";
import { DEMO, SPACE, expectNoHorizontalScroll, needsDemo, signIn } from "./helpers";

needsDemo();

test("a member sends a catalogue request and finds it under my loans", async ({ page }) => {
  // A fresh goggles request does not consume any of the desk's seeded loans.
  await signIn(page, DEMO.member3, `${SPACE}/catalogue`);
  await expect(page.getByRole("heading", { name: "Borrow", level: 1 })).toBeVisible();
  await page.getByLabel("Search the catalogue", { exact: true }).fill("Safety goggles");
  await page.getByRole("button", { name: "Add Safety goggles to your request", exact: true }).click();
  const tray = page.getByRole("region", { name: "Your request", exact: true });
  await expect(tray.getByLabel("Quantity of Safety goggles", { exact: true })).toHaveValue("1");
  const purpose = `Safety briefing ${Date.now().toString(36)}`;
  await tray.getByLabel("What is it for?").fill(purpose);
  await tray.getByRole("button", { name: "Send request", exact: true }).click();
  await page.waitForURL(new RegExp(`${SPACE}/my-loans/[a-z0-9]+$`));
  // Goggles don't need approval, so the request is approved at once (lib/lending/workflow/request.ts).
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ready to collect");
  const reference = (await page.getByRole("heading", { level: 1 }).innerText()).match(/LN-\d+/)![0];
  await expect(page.getByText("Ready to collect. Come to the desk; staff scan and photograph the items as they hand them over.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Loan items", exact: true })).toContainText("Safety goggles");
  await expect(page.getByRole("region", { name: "Details", exact: true }).getByText(purpose, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Back to my loans$/ }).click();
  await expect(page.getByRole("heading", { name: "My loans", level: 1 })).toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: reference, exact: true }) });
  await expect(row).toContainText("Safety goggles");
  await expect(row.getByText("Ready to collect", { exact: true })).toBeVisible();
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ready to collect");
});

test("a member opens self-checkout", async ({ page }) => {
  // The demo seed enables self-checkout and marks goggles and breadboards for it.
  await signIn(page, DEMO.member, `${SPACE}/catalogue`);
  await page.getByRole("link", { name: "Self-checkout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Self-checkout", level: 1 })).toBeVisible();
  const checkout = page.getByRole("region", { name: "Self-checkout", exact: true });
  await expect(checkout.getByLabel("Code under the label", { exact: true })).toBeVisible();
  await expect(checkout.getByText("Step 1 of 3", { exact: true })).toBeVisible();
  await expect(checkout.getByRole("button", { name: "Next: Check the lines", exact: true })).toBeDisabled();
});

test("member loans work at phone width without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO.member, `${SPACE}/my-loans`);
  const response = await page.goto(`${SPACE}/my-loans`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "My loans", level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
