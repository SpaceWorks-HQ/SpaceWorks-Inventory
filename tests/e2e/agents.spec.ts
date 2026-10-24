import { expect, test } from "@playwright/test";
import { prisma } from "./demoDb";
import { DEMO, SPACE, expectNoHorizontalScroll, needsDemo, signIn } from "./helpers";

needsDemo();
// These journeys add synthetic inventory through the real manager interface.
// Never run their fixture writes against an ordinary application database.
const disposableDemo = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname.endsWith("_demo");
test.skip(!disposableDemo, "Agent browser fixtures require a disposable *_demo database.");
const sensors: { id: string; name: string }[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await browser.newPage();
  try {
    await signIn(page, DEMO.manager, `${SPACE}/items/new`);
    for (const [index, label] of ["temperature humidity sensor", "alternative environment sensor"].entries()) {
      if (index) await page.goto(`${SPACE}/items/new`);
      const name = `SYNTHETIC browser ${label} ${Date.now().toString(36)}`;
      await page.getByLabel("Name", { exact: true }).fill(name);
      await page.getByLabel(/^Tags/).fill("capability:temperature, capability:humidity, voltage:3.3V, interface:i2c, synthetic-demo");
      await page.getByRole("switch", { name: /^Members can borrow this/ }).click();
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      await page.waitForURL(url => url.pathname.startsWith(`${SPACE}/items/`) && !url.pathname.endsWith("/new"));
      await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
      const id = new URL(page.url()).pathname.split("/").at(-1)!;
      sensors.push({ id, name });
      await page.getByRole("button", { name: "Receive stock", exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel(/^Quantity/).fill(index ? "3" : "5");
      await dialog.getByLabel(/^Note/).fill("Synthetic local browser fixture; no actual hardware receipt.");
      await dialog.getByRole("button", { name: "Receive stock", exact: true }).click();
      await expect.poll(async () => (await prisma.stockLevel.aggregate({ where: { itemId: id }, _sum: { onHand: true } }))._sum.onHand,
        { timeout: 30_000 }).toBe(index ? 3 : 5);
      await dialog.waitFor({ state: "hidden" });
    }
  } finally { await page.close(); }
});

async function businessState() {
  const ids = sensors.map(sensor => sensor.id);
  const [stock, movements, reservations, loans, receipts] = await Promise.all([
    prisma.stockLevel.findMany({ where: { itemId: { in: ids } }, orderBy: { id: "asc" } }),
    prisma.stockMovement.count({ where: { itemId: { in: ids } } }),
    prisma.stockReservation.count({ where: { itemId: { in: ids } } }),
    prisma.loan.count({ where: { space: { slug: "tinkerspace-kochi" } } }),
    prisma.agentOperationReceipt.count({ where: { space: { slug: "tinkerspace-kochi" } } }),
  ]);
  return { stock, movements, reservations, loans, receipts };
}

test.describe("native project mentor", () => {
  test("a manager reviews real catalogue alternatives and continues to the native item without stock effects", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, recordVideo: { dir: testInfo.outputDir } });
    const page = await context.newPage();
    try {
    await signIn(page, DEMO.manager, `${SPACE}/mentor`);
    await expect(page.getByRole("heading", { name: "Project mentor", level: 1 })).toBeVisible();
    const before = await businessState();
    await page.getByLabel("Project name", { exact: true }).fill("Synthetic greenhouse monitor");
    await page.getByLabel("What should the project do?", { exact: true }).fill("Measure temperature and humidity in the workshop.");
    await page.getByLabel(/^Constraints and existing hardware/).fill("Synthetic demo. Review 3.3V supply, I2C interface and actual sensor datasheets.");
    const response = page.waitForResponse(response => response.url().endsWith("/mentor/plan") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Discuss the project", exact: true }).click();
    const planResponse = await response; expect(planResponse.status()).toBe(200);
    const plan = await planResponse.json();
    expect(plan.lines.map((line: { capability: string }) => line.capability)).toEqual(["temperature", "humidity"]);
    for (const line of plan.lines) {
      expect(line.primary.canFulfil).toBe(true); expect(line.primary.proposal).toBeNull();
      expect(line.alternatives.length).toBeGreaterThanOrEqual(1);
      expect(line.primary.handoff.path).toMatch(new RegExp(`^${SPACE}/items/`));
    }
    await expect(page.getByRole("heading", { name: "Questions to discuss", exact: true })).toBeVisible();
    for (const sensor of sensors) await expect(page.getByRole("heading", { name: sensor.name, exact: true }).first()).toBeVisible();
    await expect(page.getByText("Catalogue alternative", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Confirm|Take stock|Approve loan/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await page.screenshot({ path: testInfo.outputPath("mentor-plan.png"), fullPage: true });
    const handoff = page.getByRole("link", { name: "Review this item in Inventory", exact: true }).first();
    const path = await handoff.getAttribute("href");
    await handoff.click(); await page.waitForURL(new RegExp(`${path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await businessState()).toEqual(before);
    } finally { await context.close(); }
  });
});

test("staff can open mentoring while members cannot read its page or planning endpoint", async ({ page }) => {
  await signIn(page, DEMO.staff, `${SPACE}/mentor`);
  await expect(page.getByRole("heading", { name: "Project mentor", level: 1 })).toBeVisible();
  const staffPlan = await page.request.post("/api/ops/v1/tinkerspace-kochi/mentor/plan", {
    headers: { Origin: new URL(page.url()).origin }, data: { project: "Staff review", goal: "Measure temperature" },
  });
  expect(staffPlan.status()).toBe(200);
  expect((await staffPlan.json()).lines[0].primary.handoff.path).toMatch(new RegExp(`^${SPACE}/items/`));
  await signIn(page, DEMO.member, `${SPACE}/catalogue`);
  expect((await page.goto(`${SPACE}/mentor`))?.status()).toBe(404);
  const result = await page.request.post("/api/ops/v1/tinkerspace-kochi/mentor/plan", {
    headers: { Origin: new URL(page.url()).origin }, data: { project: "Restricted", goal: "Measure temperature" },
  });
  expect(result.status()).toBe(403);
  expect((await result.json()).error.code).toBe("FORBIDDEN");
});

test("a signed-in manager creates a private Telegram link code and revokes unused access", async ({ page }) => {
  await signIn(page, DEMO.manager, `${SPACE}/mentor`);
  const account = page.getByRole("region", { name: "Inventory Telegram account", exact: true });
  try {
    const issued = page.waitForResponse(response => response.url().endsWith("/api/ops/telegram/tinkerspace-kochi") && response.request().method() === "POST");
    await account.getByRole("button", { name: "Create private link code", exact: true }).click();
    const response = await issued; expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    const value = await response.json(); expect(value.code).toMatch(/^[a-f0-9]{64}$/);
    await expect(account.getByRole("status")).toContainText("within five minutes");
    await expect(account.locator("code")).toHaveCount(1);
  } finally {
    const revoked = page.waitForResponse(response => response.url().endsWith("/api/ops/telegram/tinkerspace-kochi") && response.request().method() === "DELETE");
    await account.getByRole("button", { name: "Revoke Telegram access", exact: true }).click();
    expect((await revoked).status()).toBe(200);
    await expect(account.getByRole("status")).toContainText("were revoked");
    await expect(account.locator("code")).toHaveCount(0);
  }
});
