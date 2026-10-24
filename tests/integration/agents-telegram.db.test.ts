import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTelegramBot, createTelegramState, pollTelegramOnce } from "@spaceworks-hq/agents/telegram";
import { planProject, type MentorContext } from "@spaceworks-hq/agents/mentor";
import { MemoryStore } from "@spaceworks-hq/agents/stores";
import type { TelegramOutput } from "@spaceworks-hq/agents/telegram";
import { inventoryTelegramLinks, lookupInventoryTelegramActor } from "@/lib/agents/telegram/links";
import { configureTelegram } from "@/lib/agents/telegram/bindings";
import { prisma } from "@/lib/db";
import { createItem } from "@/lib/catalogue/items";
import { receiveStock } from "@/lib/inventory/availability";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const model = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@spaceworks-hq/agents/codex", () => ({ createCodexMentorPlanner: () => model.run }));

let a: Awaited<ReturnType<typeof seedSpace>>, b: Awaited<ReturnType<typeof seedSpace>>;
let directory: string, itemId: string;
let updateId = 1;
const identity = { userId: 818181, chatId: 818181 };
const update = (text: string) => ({ update_id: updateId++, message: { message_id: updateId, from: { id: identity.userId, is_bot: false }, chat: { id: identity.chatId, type: "private" }, text } });
beforeAll(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), "inventory-telegram-db-")));
  vi.stubEnv("AGENTS_TELEGRAM_NAMESPACE", "inventory-test"); vi.stubEnv("AGENTS_TELEGRAM_DATA_DIR", ".data/private");
  vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3100"); vi.stubEnv("AGENTS_MENTOR", "deterministic");
  vi.stubEnv("AGENTS_INTEGRATION_PR", ""); vi.stubEnv("AGENTS_INTEGRATION_HEAD", ""); vi.stubEnv("AGENTS_VERIFIED_REVISION", "");
  a = await seedSpace(uniqueSuffix()); b = await seedSpace(uniqueSuffix());
  const item = await prisma.$transaction(tx => createItem(tx, a.space.id, { name: "Telegram temperature sensor", lendable: true, tags: ["capability:temperature"] }, { userId: a.owner.id }));
  itemId = item.id;
  await prisma.$transaction(tx => receiveStock(tx, { spaceId: a.space.id, itemId, locationId: a.shelfA.id, quantity: 3 }, { userId: a.owner.id }));
});
afterAll(async () => {
  await cleanup([a.space.slug], a.domain); await cleanup([b.space.slug], b.domain);
  await rm(directory, { recursive: true, force: true }); vi.unstubAllEnvs();
});
describe("Inventory Telegram real account and adapter bindings", () => {
  it("shares durable single-use codes across independent web/worker stores", async () => {
    const web = await inventoryTelegramLinks(directory), worker = await inventoryTelegramLinks(directory);
    const actor = await lookupInventoryTelegramActor(a.staff.id, a.space.id); expect(actor).not.toBeNull();
    const issued = await web.issue(actor!); await worker.redeem(identity, issued.code);
    expect(await web.resolve(identity)).toMatchObject({ id: a.staff.id, tenantId: a.space.id, role: "staff" });
    await expect(worker.redeem({ userId: 919191, chatId: 919191 }, issued.code)).rejects.toMatchObject({ code: "TELEGRAM_LINK_DENIED" });
    expect(await lookupInventoryTelegramActor(a.staff.id, b.space.id)).toBeNull();
    const other = await web.issue(actor!); await web.revoke(actor!);
    expect(await worker.resolve(identity)).toBeNull(); await expect(worker.redeem(identity, other.code)).rejects.toThrow();
  });
  it("reloads suspension, role changes and disabled accounts without trusting Telegram text", async () => {
    const links = await inventoryTelegramLinks(directory), actor = (await lookupInventoryTelegramActor(a.staff.id, a.space.id))!;
    await links.redeem(identity, (await links.issue(actor)).code);
    const where = { userId_spaceId: { userId: a.staff.id, spaceId: a.space.id } };
    await prisma.membership.update({ where, data: { role: "MEMBER" } }); expect((await links.resolve(identity))?.role).toBe("member");
    await prisma.membership.update({ where, data: { role: "TECHNICIAN" } }); expect(await links.resolve(identity)).toBeNull();
    await prisma.membership.update({ where, data: { role: "STAFF", status: "SUSPENDED" } }); expect(await links.resolve(identity)).toBeNull();
    await prisma.membership.update({ where, data: { status: "ACTIVE" } });
    await prisma.user.update({ where: { id: a.staff.id }, data: { disabledAt: new Date() } }); expect(await links.resolve(identity)).toBeNull();
    await prisma.user.update({ where: { id: a.staff.id }, data: { disabledAt: null } });
  });
  it("polls mocked transport through real bindings and preserves unmerged write denial", async () => {
    const host = await configureTelegram({ mode: "inventory", namespace: "inventory-test", root: directory });
    const links = await inventoryTelegramLinks(directory), actor = (await lookupInventoryTelegramActor(a.staff.id, a.space.id))!;
    const code = (await links.issue(actor)).code;
    const bot = createTelegramBot({ ...host, store: new MemoryStore(createTelegramState()) });
    const sent: TelegramOutput[] = [], cursorStore = new MemoryStore({ offset: null as number | null });
    const updates = [update(`/link ${code}`), update("/status")];
    await pollTelegramOnce({ handler: bot.handleUpdate, cursorStore, transport: { getUpdates: async () => updates, send: async value => { sent.push(value); } } });
    expect(sent.some(value => value.kind === "message" && value.text.includes("link recorded"))).toBe(true);
    expect(sent.some(value => value.kind === "message" && value.text.includes("remain inactive"))).toBe(true);
    expect((await cursorStore.read()).offset).toBe(updates.at(-1)!.update_id + 1);
    const plan = await host.adapter!.mentor!(actor, { project: "Weather", goal: "Measure temperature", requirements: [{ capability: "temperature", quantity: 1 }] });
    expect(plan.lines[0]?.primary?.itemId).toBe(itemId);
    expect(plan.lines[0]?.primary?.handoff?.path).toBe(`/s/${a.space.slug}/items/${itemId}`);
    expect(plan.lines[0]?.primary?.proposal).toBeNull();
    const manager = (await lookupInventoryTelegramActor(a.owner.id, a.space.id))!;
    const snapshot = await host.adapter!.snapshot(manager);
    const before = await prisma.stockMovement.count({ where: { spaceId: a.space.id } });
    await expect(host.adapter!.execute(manager, "stock.receive", { itemId, locationId: a.shelfA.id, quantity: 2 }, { actionKey: "telegram-unmerged", confirmed: true, expectedPolicyVersion: snapshot.policy.version })).rejects.toMatchObject({ code: "AWAITING_MERGE" });
    expect(await prisma.stockMovement.count({ where: { spaceId: a.space.id } })).toBe(before);
    expect(await prisma.agentOperationReceipt.count({ where: { spaceId: a.space.id, actionKey: "telegram-unmerged" } })).toBe(0);
    await links.revoke(actor); const denied = await bot.handleUpdate(update("/mentor"));
    expect(denied.some(value => value.kind === "message" && value.text.includes("Sign in to the host"))).toBe(true);
  });
  it.each(["revoke", "relink"])("withholds mentor outcomes after link %s during model planning", async change => {
    vi.stubEnv("AGENTS_MENTOR", "codex"); vi.stubEnv("AGENTS_CODEX_LOCAL_PROCESS_ACK", "true"); vi.stubEnv("AGENTS_CODEX_SCRATCH_DIR", directory);
    const links = await inventoryTelegramLinks(directory), actor = (await lookupInventoryTelegramActor(a.staff.id, a.space.id))!;
    await links.redeem(identity, (await links.issue(actor)).code);
    const host = await configureTelegram({ mode: "inventory", namespace: "inventory-test", root: directory });
    const bot = createTelegramBot({ ...host, store: new MemoryStore(createTelegramState()) });
    const otherActor = (await lookupInventoryTelegramActor(b.owner.id, b.space.id))!;
    const otherCode = (await links.issue(otherActor)).code;
    model.run.mockClear();
    model.run.mockImplementation(async (input: unknown, context: MentorContext) => {
      if (change === "revoke") await links.revoke(actor);
      else await links.redeem(identity, otherCode);
      return planProject(input, context);
    });
    try {
      for (const text of ["/mentor", "Weather", "Measure temperature", "temperature | 1"]) await bot.handleUpdate(update(text));
      const last = update("skip"), outputs = await bot.handleUpdate(last);
      expect(model.run).toHaveBeenCalled();
      expect(outputs.some(value => value.kind === "message" && value.text.includes("Telegram temperature sensor"))).toBe(false);
      expect(outputs.some(value => value.kind === "message" && value.text.includes(itemId))).toBe(false);
      expect(await bot.handleUpdate(last)).toEqual(outputs);
    } finally { vi.stubEnv("AGENTS_MENTOR", "deterministic"); }
  });
});
