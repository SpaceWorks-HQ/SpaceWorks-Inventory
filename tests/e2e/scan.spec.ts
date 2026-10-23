import { expect, test } from "@playwright/test";
import { DEMO, SPACE, needsDemo, signIn } from "./helpers";
import { itemLabelCode } from "./labels";

needsDemo();

test("a typed item code resolves to its item and current loan", async ({ page }) => {
  // This overdue drill loan is not changed by any other journey.
  await signIn(page, DEMO.staff, `${SPACE}/loans?tab=overdue`);
  const row = page.getByRole("region", { name: "Loans", exact: true }).getByRole("row").filter({ hasText: "Cordless drill, 18 V" });
  const reference = await row.getByRole("link").innerText();
  await page.goto(`${SPACE}/scan`);
  await expect(page.getByRole("heading", { name: "Scan", level: 1 })).toBeVisible();
  await page.getByLabel("Code under the label", { exact: true }).fill(await itemLabelCode("tinkerspace-kochi", "DRILL-CORDLESS"));
  await page.getByRole("button", { name: "Add code", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Found Cordless drill, 18 V (DRILL-CORDLESS)." })).toBeVisible();
  const result = page.getByRole("region", { name: "Scanned label", exact: true });
  await expect(result.getByRole("heading", { name: "Cordless drill, 18 V (DRILL-CORDLESS)", exact: true })).toBeVisible();
  await expect(result.getByRole("link", { name: `Open ${reference}`, exact: true })).toBeVisible();
  await result.getByRole("link", { name: "Open item", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${SPACE}/items/[a-z0-9]+$`));
  await expect(page.getByRole("heading", { name: "Cordless drill, 18 V", level: 1 })).toBeVisible();
});
