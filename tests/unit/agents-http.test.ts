import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ user: vi.fn(), space: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ getCurrentUser: f.user, findSpaceForUser: f.space }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: f.rate }));
vi.mock("@/lib/agents/adapter", () => ({ createInventoryOpsAdapter: () => ({ snapshot: async () => ({ policy: { version: 1 } }), operations: async () => [] }) }));
vi.mock("@/lib/agents/activation", () => ({ inventoryAgentActivation: async () => ({ status: "awaiting-merge" }) }));
import { inventoryOpsHttp } from "@/lib/agents/http";

beforeEach(() => {
  vi.clearAllMocks(); f.user.mockResolvedValue({ id: "signed-in-user", name: "Staff" });
  f.space.mockResolvedValue({ space: { id: "real-space" }, membership: { role: "STAFF" } }); f.rate.mockResolvedValue(true);
});
function request(origin?: string) { return new Request("http://localhost:3100/api/ops/v1/test/mentor/plan", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: "{}" }); }

describe("host-authenticated ops route", () => {
  it("requires login before exposing any space or route details", async () => {
    f.user.mockResolvedValue(null);
    expect((await inventoryOpsHttp(request(), "test", ["mentor", "plan"])).status).toBe(401);
    expect(f.space).not.toHaveBeenCalled();
  });
  it("makes foreign spaces and technicians unavailable", async () => {
    f.space.mockResolvedValue(null);
    expect((await inventoryOpsHttp(request(), "test", ["mentor", "plan"])).status).toBe(404);
    f.space.mockResolvedValue({ space: { id: "real-space" }, membership: { role: "TECHNICIAN" } });
    expect((await inventoryOpsHttp(request(), "test", ["mentor", "plan"])).status).toBe(404);
  });
  it("denies missing and foreign Origin before dispatch or model work", async () => {
    expect((await inventoryOpsHttp(request(), "test", ["mentor", "plan"])).status).toBe(403);
    expect((await inventoryOpsHttp(request("https://foreign.invalid"), "test", ["mentor", "plan"])).status).toBe(403);
    expect(f.rate).not.toHaveBeenCalled();
  });
  it("normalizes only the trusted route and preserves request bodies", async () => {
    const response = await inventoryOpsHttp(new Request("http://localhost:3100/api/ops/v1/test/health"), "test", ["health"]);
    expect(response.status).toBe(200); expect((await response.json()).status).toBe("ok");
    expect((await inventoryOpsHttp(request("http://localhost:3100"), "test", ["..", "health"])).status).toBe(404);
  });
});
