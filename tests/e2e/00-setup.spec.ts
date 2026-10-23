import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

// First run only: on an empty database (CI's disposable hosting harness or a
// fresh local database) the wizard creates the instance admin and the first
// space, then the space setup builds locations and loads sample data.
test("first-run setup creates the admin and a ready makerspace", async ({ page }) => {
  test.setTimeout(180_000);
  const response = await page.goto("/setup");
  test.skip(!page.url().endsWith("/setup") || response?.status() !== 200, "Setup is already complete on this database.");
  const email = `admin-${randomUUID().slice(0, 8)}@example.test`;
  await page.getByLabel("Your name", { exact: true }).fill("First Admin");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(`first-run-${randomUUID()}`);
  await page.getByLabel("Space name", { exact: true }).fill("Test Makerspace");
  await page.getByRole("button", { name: "Create space and continue", exact: true }).click();
  await page.waitForURL(/\/s\/test-makerspace\/setup/);
  await expect(page.getByRole("heading", { name: "Set up your space", level: 1 })).toBeVisible();

  await page.goto("/s/test-makerspace/setup?step=2");
  await page.getByLabel("Building", { exact: true }).fill("Main building");
  await page.getByLabel("Room 1 name", { exact: true }).fill("Electronics lab");
  await page.getByRole("button", { name: "Build the list", exact: true }).click();
  await expect(page.getByRole("table", { name: "Planned locations" })).toBeVisible();
  await page.getByRole("button", { name: "Save locations", exact: true }).click();
  await page.waitForURL(/step=3/);

  await page.goto("/s/test-makerspace/setup?step=6");
  await page.getByRole("button", { name: "Load sample data", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Added");
  await page.getByRole("button", { name: "Finish setup", exact: true }).click();
  await page.waitForURL(/\/s\/test-makerspace$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("First");
});
