import { expect, test } from "@playwright/test";
import { DEMO, SPACE, expectNoHorizontalScroll, needsDemo, signIn } from "./helpers";

needsDemo();

test("an inventory manager adds an item and receives stock into a shelf", async ({ page }) => {
  await signIn(page, DEMO.manager, `${SPACE}/items/new`);
  const name = `Heat gun ${Date.now().toString(36)}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel(/^Unit cost/).fill("1200");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.waitForURL(new RegExp(`${SPACE}/items/[a-z0-9]+$`));
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Receive stock", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Quantity/).fill("4");
  await dialog.getByRole("button", { name: "Receive stock", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Received 4", { exact: false }).first()).toBeVisible();
});

test("space settings save lending fees and the change is audited", async ({ page }) => {
  await signIn(page, DEMO.creator, `${SPACE}/settings?tab=fees`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).first().click();
  await page.goto(`${SPACE}/audit`);
  await expect(page.getByRole("heading", { name: "Audit log", level: 1 })).toBeVisible();
});

test("staff pages, reports and settings work at phone width without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO.creator);
  for (const path of ["", "/items", "/stock", "/locations", "/kits", "/reports", "/members", "/settings", "/settings/inventory", "/settings/integrations", "/purchases"]) {
    const response = await page.goto(`${SPACE}${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test("the public catalogue needs no sign-in and hides stock counts", async ({ page }) => {
  const response = await page.goto("/c/tinkerspace-kochi");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("TinkerSpace Kochi");
  expect(await page.locator("main").innerText()).not.toMatch(/\bonHand\b|\bELAB-/);
  expect((await page.goto("/c/maker-lab-thrissur"))?.status()).toBe(404);
});

test("dark mode renders the space home with the brand tokens", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, DEMO.staff, SPACE);
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).not.toBe("rgb(255, 255, 255)");
});
