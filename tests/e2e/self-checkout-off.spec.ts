import { expect, test } from "@playwright/test";
import { setSelfCheckout } from "./demoDb";
import { DEMO, SPACE, needsDemo, signIn } from "./helpers";

needsDemo();

test("a member who opens self-checkout while it is switched off is told why", async ({ page }) => {
  await setSelfCheckout("tinkerspace-kochi", false);
  try {
    await signIn(page, DEMO.member, `${SPACE}/catalogue`);
    await expect(page.getByRole("link", { name: "Self-checkout", exact: true })).toHaveCount(0);
    const response = await page.goto(`${SPACE}/catalogue/self-checkout`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Self-checkout is switched off", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Request from the catalogue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Borrow", level: 1 })).toBeVisible();
    // A space the member doesn't belong to stays not-found.
    expect((await page.goto("/s/maker-lab-thrissur/catalogue/self-checkout"))?.status()).toBe(404);
  } finally {
    await setSelfCheckout("tinkerspace-kochi", true);
  }
});
