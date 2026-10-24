import { expect, test } from "@playwright/test";
import { DEMO, PNG, SPACE, expectNoHorizontalScroll, needsDemo, nextStep, signIn } from "./helpers";
import { loanLabelCodes, recordId } from "./labels";

needsDemo();

test("staff approve a requested loan", async ({ page }) => {
  // Nisha's caliper request is separate from the ready and issued loans below.
  await signIn(page, DEMO.staff, `${SPACE}/loans`);
  await expect(page.getByRole("heading", { name: "Loans", level: 1 })).toBeVisible();
  const row = page.getByRole("region", { name: "Loans", exact: true }).getByRole("row").filter({ hasText: "Nisha Kurian" });
  await expect(row.getByText("Requested", { exact: true })).toBeVisible();
  await row.getByRole("link").click();
  const approval = page.getByRole("region", { name: "Approve the request", exact: true });
  await expect(approval.getByLabel("Approve units of Digital caliper, 150 mm")).toHaveValue("1");
  await approval.getByRole("button", { name: "Approve 1 unit", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ready to collect");
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Approved", { exact: true })).toBeVisible();
});

test("staff issue the ready loan with item scans, a photo and remarks", async ({ page }) => {
  await signIn(page, DEMO.staff, `${SPACE}/loans?tab=ready`);
  const row = page.getByRole("region", { name: "Loans", exact: true }).getByRole("row").filter({ hasText: "Fathima Rahman" });
  await expect(row).toContainText("Arduino Uno R3");
  await row.getByRole("link").click();
  await page.waitForURL(/\/loans\/[a-z0-9]+$/);
  const codes = await loanLabelCodes(recordId(page.url()), "issue");
  expect(codes).toHaveLength(2);
  const handover = page.getByRole("region", { name: "Hand over", exact: true });
  await expect(handover.getByRole("button", { name: /^Next: / })).toBeDisabled();
  await expect(handover.locator('li[aria-current="step"]')).toContainText("Scan");
  for (const code of codes) {
    await handover.getByLabel("Code under the label", { exact: true }).fill(code);
    await handover.getByRole("button", { name: "Add code", exact: true }).click();
  }
  await nextStep(handover);
  await expect(handover.getByRole("list", { name: "Still to scan" }).getByText("Done", { exact: true })).toHaveCount(2);
  await nextStep(handover);
  await expect(handover.getByRole("button", { name: "Issue loan", exact: true })).toBeDisabled();
  await handover.getByLabel("Take photo", { exact: true }).setInputFiles({ name: "issue.png", mimeType: "image/png", buffer: PNG });
  const remarks = "Arduino and wire stripper checked with the borrower.";
  await handover.getByRole("textbox", { name: /^Remarks/ }).fill(remarks);
  await handover.getByRole("button", { name: "Issue loan", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("On loan");
  await expect(handover).toBeHidden();
  await expect(page).toHaveURL(/\?done=issue$/);
  await expect(page.getByRole("region", { name: "Handed over", exact: true }).getByRole("status")).toContainText("The loan is on loan now.");
  const evidence = page.getByRole("region", { name: "Evidence", exact: true });
  await expect(evidence.getByText(remarks, { exact: true })).toBeVisible();
  await expect(evidence.getByText("2 labels scanned", { exact: true })).toBeVisible();
  await expect(evidence.getByRole("img", { name: /^Handed over photo 1,/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Handed over", { exact: true })).toBeVisible();
});

test("staff renew and return the seeded issued loan with asset and item scans", async ({ page }) => {
  // Use the multimeter loan, leaving Vivek's overdue drill for the scan journey.
  await signIn(page, DEMO.staff, `${SPACE}/loans?tab=on-loan`);
  const row = page.getByRole("region", { name: "Loans", exact: true }).getByRole("row").filter({ hasText: "Digital multimeter" });
  await row.getByRole("link").click();
  await page.waitForURL(/\/loans\/[a-z0-9]+$/);
  await page.getByRole("region", { name: "Loan actions", exact: true }).getByRole("button", { name: "Renew", exact: true }).click();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Renewed", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Details", exact: true }).getByText("Renewals", { exact: true })).toBeVisible();
  const codes = await loanLabelCodes(recordId(page.url()), "return");
  expect(codes).toHaveLength(2);
  const takeBack = page.getByRole("region", { name: "Take back", exact: true });
  await nextStep(takeBack);
  for (const code of codes) {
    await takeBack.getByLabel("Code under the label", { exact: true }).fill(code);
    await takeBack.getByRole("button", { name: "Add code", exact: true }).click();
  }
  await expect(takeBack.getByRole("list", { name: "Still to scan" }).getByText("Done", { exact: true })).toHaveCount(2);
  await nextStep(takeBack);
  await takeBack.getByLabel("Take photo", { exact: true }).setInputFiles({ name: "return.png", mimeType: "image/png", buffer: PNG });
  await expect(takeBack.getByRole("button", { name: "Record return", exact: true })).toBeDisabled();
  const remarks = "Multimeter and pliers returned in good condition.";
  await takeBack.getByRole("textbox", { name: /^Remarks/ }).fill(remarks);
  await takeBack.getByRole("button", { name: "Record return", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Returned");
  await expect(takeBack).toBeHidden();
  await expect(page.getByRole("region", { name: "Return recorded", exact: true })).toBeVisible();
  const evidence = page.getByRole("region", { name: "Evidence", exact: true });
  await expect(evidence.getByText(remarks, { exact: true })).toBeVisible();
  await expect(evidence.getByRole("img", { name: /^Returned photo 1,/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Timeline", exact: true }).getByText("Returned", { exact: true })).toBeVisible();
});

test("lending desk pages work at phone width without sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, DEMO.staff, `${SPACE}/loans`);
  for (const path of ["/loans", "/transfers", "/counts", "/scan"]) {
    const response = await page.goto(`${SPACE}${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});
