import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";

// Runs only inside scripts/test-split-hosting.mjs: the website (frontend
// image) renders pages and forwards actions to the API (backend image).
test.skip(process.env.PLAYWRIGHT_SPLIT !== "1", "The split-hosting harness supplies isolated production servers.");
const prisma = new PrismaClient();
const suffix = randomUUID().slice(0, 8), slug = `gateway-browser-${suffix}`, email = `gateway-browser-${suffix}@example.test`, password = randomUUID();
let userId: string, spaceId: string;

test.beforeAll(async () => {
  const user = await prisma.user.create({ data: { email, name: "Gateway reviewer", passwordHash: await bcrypt.hash(password, 10), emailVerified: new Date() } });
  userId = user.id;
  const space = await prisma.space.create({ data: { slug, name: "Gateway browser space", tagPrefix: `G${suffix.slice(0, 4).toUpperCase()}`, setupCompletedAt: new Date(), memberships: { create: { userId, role: "MANAGER" } } } });
  spaceId = space.id;
});
test.afterAll(async () => {
  if (spaceId) await prisma.space.deleteMany({ where: { id: spaceId, slug } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId, email } });
  await prisma.$disconnect();
});

test("renders pages and writes through the action gateway; private endpoints stay closed", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.goto(`/login?callbackUrl=/s/${slug}/settings`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`/s/${slug}/settings`);
  const tagline = `Tools for every maker ${suffix}`;
  await page.getByLabel("Tagline", { exact: true }).fill(tagline);
  await page.getByRole("button", { name: "Save changes", exact: true }).first().click();
  await expect.poll(async () => (await prisma.space.findUniqueOrThrow({ where: { id: spaceId } })).tagline, { timeout: 15_000 }).toBe(tagline);
  // Space pages exist only on the website; the API host answers 404 for them.
  const backend = process.env.BACKEND_ORIGIN!;
  expect((await fetch(`${backend}/s/${slug}`, { redirect: "manual" })).status).toBe(404);
  expect((await request.post("/api/internal/jobs")).status()).toBe(404);
  expect((await request.post("/api/frontend/view/private")).status()).toBe(404);
  const api = await request.get("/api/v1/space");
  expect(api.status()).toBe(401);
  expect(api.headers()["www-authenticate"]).toContain("Bearer");
});
