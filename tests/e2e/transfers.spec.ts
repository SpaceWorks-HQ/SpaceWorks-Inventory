import { expect, test } from "@playwright/test";
import { DEMO, PNG, SPACE, needsDemo, nextStep, signIn } from "./helpers";
import { recordId, transferLabelCodes } from "./labels";

needsDemo();

test("a manager approves an internal transfer and staff dispatch and receive it", async ({ page }) => {
  await signIn(page, DEMO.manager, `${SPACE}/transfers`);
  await expect(page.getByRole("heading", { name: "Transfers", level: 1 })).toBeVisible();
  const row = page.getByRole("region", { name: "Transfers", exact: true }).getByRole("row").filter({ hasText: "Inside this space" });
  await expect(row.getByText("Requested", { exact: true })).toBeVisible();
  await row.getByRole("link").click();
  await page.waitForURL(new RegExp(`${SPACE}/transfers/[a-z0-9]+$`));
  const transferPath = new URL(page.url()).pathname;
  await expect(page.getByRole("region", { name: "Details", exact: true })).toContainText("Printer corner restock");
  await page.getByRole("region", { name: "Approve", exact: true }).getByRole("button", { name: "Approve 2 units", exact: true }).click();
  await expect(page.getByText("Approved, to pick", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Approved (2 units)", { exact: true })).toBeVisible();

  await signIn(page, DEMO.staff, transferPath);
  // An internal transfer keeps the same item, so the same label is scanned at both ends.
  const codes = await transferLabelCodes(recordId(page.url()), "dispatch");
  expect(codes).toHaveLength(1);
  const code = codes[0]!;
  const dispatch = page.getByRole("region", { name: "Dispatch", exact: true });
  await nextStep(dispatch);
  await expect(dispatch.getByRole("button", { name: /^Next: / })).toBeDisabled();
  await dispatch.getByLabel("Code under the label", { exact: true }).fill(code);
  await dispatch.getByRole("button", { name: "Add code", exact: true }).click();
  await expect(dispatch.getByText("Ready", { exact: true })).toBeVisible();
  await nextStep(dispatch);
  await dispatch.getByLabel("Take photo", { exact: true }).setInputFiles({ name: "dispatch.png", mimeType: "image/png", buffer: PNG });
  const dispatchRemarks = "Two sealed spools checked before moving to the electronics shelf.";
  await dispatch.getByRole("textbox", { name: /^Remarks/ }).fill(dispatchRemarks);
  await dispatch.getByLabel("Carrier").fill("Hand carry");
  await dispatch.getByRole("button", { name: "Dispatch 2 units", exact: true }).click();
  await expect(page.getByRole("region", { name: "Dispatched", exact: true }).getByRole("status")).toContainText("in transit");
  await expect(page.getByRole("heading", { level: 1 }).locator("..").getByText("In transit", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Dispatched (2 units)", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence", exact: true }).getByText(dispatchRemarks, { exact: true })).toBeVisible();

  const receive = page.getByRole("region", { name: "Receive", exact: true });
  await receive.getByLabel("Code under the label", { exact: true }).fill(code);
  await receive.getByRole("button", { name: "Add code", exact: true }).click();
  await nextStep(receive);
  await expect(receive.getByLabel("Good PLA filament, black, 1 kg received", { exact: true })).toHaveValue("2");
  await nextStep(receive);
  await expect(receive.getByRole("combobox", { name: "Put it on", exact: true })).toContainText("ELAB-SA");
  await receive.getByLabel("Take photo", { exact: true }).setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  const receiveRemarks = "Both spools received intact on the destination shelf.";
  await receive.getByRole("textbox", { name: /^Remarks/ }).fill(receiveRemarks);
  await receive.getByRole("button", { name: "Receive 2 units", exact: true }).click();
  await expect(page.getByRole("region", { name: "Received", exact: true }).getByRole("status")).toContainText("in stock");
  await expect(page.getByRole("heading", { level: 1 }).locator("..").getByText("Received", { exact: true })).toBeVisible();
  await expect(receive).toBeHidden();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Received 2", { exact: true })).toBeVisible();
  const evidence = page.getByRole("region", { name: "Evidence", exact: true });
  await expect(evidence.getByText(receiveRemarks, { exact: true })).toBeVisible();
  await expect(evidence.getByRole("img", { name: /^Dispatched photo 1,/ })).toBeVisible();
  await expect(evidence.getByRole("img", { name: /^Received photo 1,/ })).toBeVisible();
});

test("the cross-space transfer is in transit on both sides", async ({ page }) => {
  // Meera is a MANAGER in both seeded spaces; Joel only belongs to Kochi.
  await signIn(page, DEMO.manager, `${SPACE}/transfers`);
  const row = page.getByRole("region", { name: "Transfers", exact: true }).getByRole("row").filter({ hasText: "To Maker Lab Thrissur" });
  await expect(row.getByText("In transit", { exact: true })).toBeVisible();
  await row.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 }).locator("..").getByText("In transit", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details", exact: true })).toContainText("KP-44120");
  await page.getByRole("link", { name: "Open as Maker Lab Thrissur", exact: true }).click();
  await expect(page).toHaveURL(/\/s\/maker-lab-thrissur\/transfers\/[a-z0-9]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).locator("..").getByText("In transit", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Receive", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Evidence", exact: true }).getByText("Packed in a padded box", { exact: true })).toBeVisible();
});
