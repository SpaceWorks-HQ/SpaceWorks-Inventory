import { expect, test } from "@playwright/test";
import { DEMO, SPACE, needsDemo, signIn } from "./helpers";

needsDemo();

test("staff submit the seeded blind count and see its variances", async ({ page }) => {
  test.slow();
  await signIn(page, DEMO.staff, `${SPACE}/counts`);
  const row = page.getByRole("region", { name: "Cycle counts", exact: true }).getByRole("row").filter({ hasText: "Electronics lab, monthly" });
  await row.getByRole("link").click();
  await page.waitForURL(new RegExp(`${SPACE}/counts/[a-z0-9]+$`));
  await expect(page.getByRole("heading", { name: "Electronics lab, monthly", level: 1 })).toBeVisible();
  await expect(page.getByText("Counting", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Variances", exact: true })).toBeHidden();
  await expect(page.getByText(/^Expected \d/)).toHaveCount(0);
  // Quantity lines have typed inputs. Serialized tools use the separate tag scanner.
  // Submit for review only: deliberately differing quantities must not alter stock.
  const labels = await page.getByRole("spinbutton", { name: /^Counted / }).evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label")!));
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) {
    const input = page.getByRole("spinbutton", { name: label, exact: true });
    await input.fill("0");
    await input.press("Enter");
    const line = page.getByRole("listitem").filter({ has: input });
    await expect(line.getByText("Counted", { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Submit count", exact: true }).click();
  await expect(page.getByText("Waiting to post", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit count", exact: true })).toBeHidden();
  const variances = page.getByRole("region", { name: "Variances", exact: true }).filter({ has: page.getByRole("heading", { name: "Variances", exact: true }) });
  await expect(variances).toBeVisible();
  await expect(variances.getByRole("columnheader", { name: "Expected", exact: true })).toBeVisible();
  await expect(variances.getByRole("columnheader", { name: "Counted", exact: true })).toBeVisible();
  await expect(variances.getByRole("columnheader", { name: "Difference", exact: true })).toBeVisible();
  // Everything was counted as 0, so every line that had stock differs: a header row plus at least one line.
  expect(await variances.getByRole("row").count()).toBeGreaterThan(1);
});

test("a manager starts a new count", async ({ page }) => {
  await signIn(page, DEMO.manager, `${SPACE}/counts/new`);
  await expect(page.getByRole("heading", { name: "New count", level: 1 })).toBeVisible();
  const name = `Whole space review ${Date.now().toString(36)}`;
  await page.getByLabel("Name", { exact: true }).fill(name);
  await expect(page.getByRole("switch", { name: /^Blind count/ })).toBeChecked();
  await page.getByRole("button", { name: "Start count", exact: true }).click();
  await page.waitForURL(new RegExp(`${SPACE}/counts/[a-z0-9]+$`));
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("Counting", { exact: true })).toBeVisible();
  await expect(page.getByText("Blind cycle count", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit count", exact: true })).toBeVisible();
});
