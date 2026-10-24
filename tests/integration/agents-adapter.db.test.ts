import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createOpsHelper, type Actor } from "@spaceworks-hq/agents/helper";
import { planProject, type MentorContext } from "@spaceworks-hq/agents/mentor";
import { prisma } from "@/lib/db";
import { createInventoryOpsAdapter } from "@/lib/agents/adapter";
import { policyVersion } from "@/lib/agents/identity";
import { createItem } from "@/lib/catalogue/items";
import { receiveStock } from "@/lib/inventory/availability";
import { cleanup, seedSpace, uniqueSuffix } from "../helpers/fixtures";

const model = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@spaceworks-hq/agents/codex", () => ({ createCodexMentorPlanner: () => model.run }));

let a: Awaited<ReturnType<typeof seedSpace>>, b: Awaited<ReturnType<typeof seedSpace>>;
let itemId: string;
const adapter = createInventoryOpsAdapter({ activation: async () => ({ status: "merged", revision: "test-verified-revision" }) });
const manager = (): Actor => ({ id: a.owner.id, tenantId: a.space.id, role: "manager", name: "Manager" });
const staff = (): Actor => ({ id: a.staff.id, tenantId: a.space.id, role: "staff", name: "Staff" });
async function command(actionKey: string) {
  const space = await prisma.space.findUniqueOrThrow({ where: { id: a.space.id } });
  return { actionKey, confirmed: true, expectedPolicyVersion: policyVersion(space) };
}
beforeAll(async () => {
  vi.stubEnv("AGENTS_MENTOR", "deterministic");
  a = await seedSpace(uniqueSuffix()); b = await seedSpace(uniqueSuffix());
  const item = await prisma.$transaction(tx => createItem(tx, a.space.id, { name: "Temperature sensor", lendable: true, tags: ["capability:temperature"] }, { userId: a.owner.id }));
  itemId = item.id;
  await prisma.$transaction(tx => receiveStock(tx, { spaceId: a.space.id, itemId, locationId: a.shelfA.id, quantity: 5 }, { userId: a.owner.id }));
});
afterAll(async () => { await cleanup([a.space.slug], a.domain); await cleanup([b.space.slug], b.domain); vi.unstubAllEnvs(); });

describe("real inventory agent adapter", () => {
  it("claims concurrent confirmations once with one native stock movement and audit", async () => {
    const options = await command("receipt-concurrent");
    const input = { itemId, locationId: a.shelfA.id, quantity: 4, reason: "RECEIVED", note: "Verified delivery" };
    const results = await Promise.all([adapter.execute(manager(), "stock.receive", input, options), adapter.execute(manager(), "stock.receive", input, options)]);
    expect(results[0].actionId).toBe(results[1].actionId);
    expect(results.filter(result => result.replayed)).toHaveLength(1);
    const level = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId: a.shelfA.id } } });
    expect(level.onHand).toBe(9);
    expect(await prisma.stockMovement.count({ where: { spaceId: a.space.id, itemId, refType: "AgentReceipt" } })).toBe(1);
    expect(await prisma.agentOperationReceipt.count({ where: { spaceId: a.space.id, actionKey: options.actionKey } })).toBe(1);
    expect(await prisma.auditEvent.count({ where: { spaceId: a.space.id, action: "stock.received", targetId: itemId } })).toBe(1);
    await expect(adapter.execute(manager(), "stock.receive", { ...input, quantity: 8 }, options)).rejects.toMatchObject({ code: "ACTION_KEY_REUSED", status: 409 });
  });

  it("denies staff stock adjustments and foreign targets without receipts or ledger effects", async () => {
    await expect(adapter.execute(staff(), "stock.adjust", { itemId, locationId: a.shelfA.id, delta: -1, reason: "CONSUMED" }, await command("staff-denied"))).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(adapter.execute(manager(), "stock.receive", { itemId, locationId: b.shelfA.id, quantity: 1 }, await command("foreign-denied"))).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect(await prisma.agentOperationReceipt.count({ where: { actionKey: { in: ["staff-denied", "foreign-denied"] } } })).toBe(0);
  });

  it("rejects stale criteria and reloads revoked memberships", async () => {
    const old = await command("policy-stale");
    await prisma.space.update({ where: { id: a.space.id }, data: { maxLoanDays: 31 } });
    await expect(adapter.execute(manager(), "stock.receive", { itemId, locationId: a.shelfA.id, quantity: 1 }, old)).rejects.toMatchObject({ code: "POLICY_CHANGED", status: 409 });
    await prisma.membership.update({ where: { userId_spaceId: { userId: a.staff.id, spaceId: a.space.id } }, data: { status: "SUSPENDED" } });
    await expect(adapter.snapshot(staff())).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await prisma.membership.update({ where: { userId_spaceId: { userId: a.staff.id, spaceId: a.space.id } }, data: { status: "ACTIVE" } });
  });

  it("serializes an account disable after an authorized operation, then rejects further effects", async () => {
    const options = await command("disable-race-receipt");
    const before = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId: a.shelfA.id } } });
    const input = { itemId, locationId: a.shelfA.id, quantity: 1, reason: "RECEIVED" };
    let release!: () => void, announce!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<number>(resolve => { announce = resolve; });
    // Hold membership so the operation pauses after acquiring its account lock.
    const blocker = prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Membership" WHERE "spaceId"=${a.space.id} AND "userId"=${a.owner.id} FOR UPDATE`;
      const [connection] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      announce(connection!.pid); await gate;
    }, { timeout: 15_000 });
    const blockerPid = await ready;
    const operation = adapter.execute(manager(), "stock.receive", input, options);
    // Observe PostgreSQL's lock state rather than relying on scheduler delays.
    const observe = async (probe: () => Promise<boolean>) => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        if (await probe()) return;
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      throw new Error("Expected PostgreSQL concurrency barrier was not reached.");
    };
    let disable: Promise<void> | undefined;
    let disableFinished = false;
    const applicationName = `disable-agent-${uniqueSuffix()}`;
    try {
      await observe(async () => {
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ${blockerPid} = ANY(pg_blocking_pids(pid))) AS blocked`;
        return row!.blocked;
      });
      disable = prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('application_name', ${applicationName}, true)`;
        await tx.user.update({ where: { id: a.owner.id }, data: { disabledAt: new Date() } });
        disableFinished = true;
      }, { timeout: 15_000 });
      await observe(async () => {
        // Without the User FOR SHARE lock this update completes while the
        // authorized operation is still paused, exposing the original race.
        expect(disableFinished).toBe(false);
        const [row] = await prisma.$queryRaw<{ blocked: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name=${applicationName} AND wait_event_type='Lock') AS blocked`;
        return row!.blocked;
      });
      release();
      const result = await operation; await blocker; await disable;
      expect(result.status).toBe("succeeded");
      const after = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId: a.shelfA.id } } });
      expect(after.onHand).toBe(before.onHand + 1);
      await expect(adapter.execute(manager(), "stock.receive", input, { ...options, actionKey: "disabled-no-effects" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      expect(await prisma.agentOperationReceipt.count({ where: { actionKey: "disabled-no-effects" } })).toBe(0);
      expect((await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId: a.shelfA.id } } })).onHand).toBe(after.onHand);
    } finally {
      release(); await Promise.allSettled([blocker, operation, ...(disable ? [disable] : [])]);
      await prisma.user.update({ where: { id: a.owner.id }, data: { disabledAt: null } });
    }
  });

  it("requests a real member loan, approves native holds and leaves physical issue at the desk", async () => {
    const request = await adapter.execute(staff(), "lending.request", { itemId, quantity: 1, memberId: a.membership.id, purpose: "Weather project" }, await command("loan-request"));
    const loanId = (request.result as { loanId: string }).loanId;
    const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
    expect(loan.borrowerId).toBe(a.member.id); expect(loan.status).toBe("REQUESTED");
    await adapter.execute(staff(), "lending.approve", { loanId }, await command("loan-approve"));
    expect((await prisma.loan.findUniqueOrThrow({ where: { id: loanId } })).status).toBe("APPROVED");
    const lines = await prisma.loanLine.findMany({ where: { loanId }, select: { id: true } });
    expect(await prisma.stockReservation.count({ where: { spaceId: a.space.id, loanLineId: { in: lines.map(line => line.id) } } })).toBeGreaterThan(0);
    expect((await adapter.operations(staff())).map(operation => operation.name)).not.toContain("lending.issue");
    expect(await prisma.evidence.count({ where: { loanId } })).toBe(0);
  });

  it("returns read-only catalogue mentor alternatives with truthful native handoffs", async () => {
    await prisma.$transaction(tx => createItem(tx, a.space.id, { name: "Alternative temperature sensor", consumable: true, tags: ["capability:temperature"] }, { userId: a.owner.id }));
    const before = await prisma.stockMovement.count({ where: { spaceId: a.space.id } });
    const plan = await adapter.mentor!(staff(), { project: "Weather station", goal: "Measure temperature", requirements: [{ capability: "temperature", quantity: 1 }] });
    expect(plan.lines[0]?.primary?.itemId).toBe(itemId);
    expect(plan.lines[0]?.alternatives).toHaveLength(1);
    expect(plan.lines[0]?.primary?.proposal).toBeNull();
    expect(plan.lines[0]?.primary?.handoff?.path).toBe(`/s/${a.space.slug}/items/${itemId}`);
    expect(await prisma.stockMovement.count({ where: { spaceId: a.space.id } })).toBe(before);
  });

  it("keeps an unmerged helper inactive even when its trusted domain adapter is test-enabled", async () => {
    const helper = createOpsHelper({ authenticate: async () => manager(), adapter });
    const result = await helper.handle(new Request("http://localhost/api/ops/v1/operations/stock.receive", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { itemId, locationId: a.shelfA.id, quantity: 1 }, ...await command("unmerged") }) }));
    expect(result.status).toBe(409);
    expect((await result.json()).error.code).toBe("AWAITING_MERGE");
    expect(await prisma.agentOperationReceipt.count({ where: { actionKey: "unmerged" } })).toBe(0);
  });

  it("refreshes actual availability after an asynchronous model discussion", async () => {
    vi.stubEnv("AGENTS_MENTOR", "codex"); vi.stubEnv("AGENTS_CODEX_LOCAL_PROCESS_ACK", "true"); vi.stubEnv("AGENTS_CODEX_SCRATCH_DIR", "/private/test-worker");
    const old = await prisma.stockLevel.findUniqueOrThrow({ where: { itemId_locationId: { itemId, locationId: a.shelfA.id } } });
    model.run.mockImplementation(async (input: unknown, context: MentorContext) => {
      await prisma.$transaction(tx => receiveStock(tx, { spaceId: a.space.id, itemId, locationId: a.shelfA.id, quantity: 2 }, { userId: a.owner.id }));
      return planProject(input, context);
    });
    try {
      const plan = await adapter.mentor!(staff(), { project: "Weather station", goal: "Measure temperature", requirements: [{ capability: "temperature", quantity: 1 }] });
      expect(plan.lines[0]?.primary?.available).toBe(old.onHand - old.reserved - old.quarantined + 2);
    } finally { vi.stubEnv("AGENTS_MENTOR", "deterministic"); }
  });

  it("does not disclose a model result after staff membership is revoked during planning", async () => {
    vi.stubEnv("AGENTS_MENTOR", "codex"); vi.stubEnv("AGENTS_CODEX_LOCAL_PROCESS_ACK", "true"); vi.stubEnv("AGENTS_CODEX_SCRATCH_DIR", "/private/test-worker");
    model.run.mockImplementation(async (input: unknown, context: MentorContext) => {
      await prisma.membership.update({ where: { userId_spaceId: { userId: a.staff.id, spaceId: a.space.id } }, data: { role: "MEMBER" } });
      return planProject(input, context);
    });
    try {
      await expect(adapter.mentor!(staff(), { project: "Weather station", goal: "Measure temperature" })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    } finally {
      await prisma.membership.update({ where: { userId_spaceId: { userId: a.staff.id, spaceId: a.space.id } }, data: { role: "STAFF" } });
      vi.stubEnv("AGENTS_MENTOR", "deterministic");
    }
  });
});
