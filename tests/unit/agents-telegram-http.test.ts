import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ user: vi.fn(), space: vi.fn(), rate: vi.fn(), issue: vi.fn(), revoke: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ getCurrentUser: f.user, findSpaceForUser: f.space }));
vi.mock("@/lib/rateLimit", () => ({ checkRateLimitById: f.rate }));
vi.mock("@/lib/agents/telegram/config", () => ({ inventoryTelegramConfig: async () => ({ hostUrl: "http://localhost:3100" }) }));
vi.mock("@/lib/agents/telegram/links", () => ({ inventoryTelegramLinks: async () => ({ issue: f.issue, revoke: f.revoke }), lookupInventoryTelegramActor: f.lookup }));
import { inventoryTelegramHttp } from "@/lib/agents/telegram/http";
const actor = { id: "session-user", tenantId: "session-space", role: "staff" };
beforeEach(() => {
  vi.clearAllMocks(); f.user.mockResolvedValue({ id: actor.id }); f.space.mockResolvedValue({ space: { id: actor.tenantId }, membership: { role: "STAFF" } });
  f.lookup.mockResolvedValue(actor); f.rate.mockResolvedValue(true); f.issue.mockResolvedValue({ code: "private-code", expiresAt: 123 });
});
function request(method = "POST", origin = "http://localhost:3100", body?: string) {
  return new Request("http://localhost:3100/api/ops/telegram/test", { method, headers: { origin }, body });
}
describe("host Telegram link route", () => {
  it("issues and revokes only the authenticated account with no-store responses", async () => {
    const response = await inventoryTelegramHttp(request(), "test");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(f.issue).toHaveBeenCalledWith(actor);
    expect((await inventoryTelegramHttp(request("DELETE"), "test")).status).toBe(200); expect(f.revoke).toHaveBeenCalledWith(actor);
  });
  it("denies missing sessions, foreign spaces and technicians", async () => {
    f.user.mockResolvedValue(null); expect((await inventoryTelegramHttp(request(), "test")).status).toBe(401);
    f.user.mockResolvedValue({ id: actor.id }); f.space.mockResolvedValue(null); expect((await inventoryTelegramHttp(request(), "test")).status).toBe(404);
    f.space.mockResolvedValue({ membership: { role: "TECHNICIAN" } }); expect((await inventoryTelegramHttp(request(), "test")).status).toBe(404);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it("rejects CSRF and body-supplied identities before issuing a code", async () => {
    expect((await inventoryTelegramHttp(request("POST", "https://foreign.invalid"), "test")).status).toBe(403);
    expect((await inventoryTelegramHttp(request("POST", "http://localhost:3100", JSON.stringify({ actorId: "forged" })), "test")).status).toBe(400);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it("rejects stalled streaming bodies within a bounded deadline", async () => {
    const body = new ReadableStream<Uint8Array>({ start() {} });
    const incoming = new Request("http://localhost:3100/api/ops/telegram/test", { method: "POST", headers: { origin: "http://localhost:3100" }, body, duplex: "half" } as RequestInit);
    expect((await inventoryTelegramHttp(incoming, "test")).status).toBe(400);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it("accepts Next's empty browser stream and rejects the first nonempty chunk", async () => {
    const empty = new ReadableStream<Uint8Array>({ start(controller) { controller.close(); } });
    const make = (body: ReadableStream<Uint8Array>) => new Request("http://localhost:3100/api/ops/telegram/test", { method: "POST", headers: { origin: "http://localhost:3100" }, body, duplex: "half" } as RequestInit);
    expect((await inventoryTelegramHttp(make(empty), "test")).status).toBe(200);
    f.issue.mockClear();
    const nonempty = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("forged actor")); } });
    expect((await inventoryTelegramHttp(make(nonempty), "test")).status).toBe(400);
    expect(f.issue).not.toHaveBeenCalled();
  });
  it("rechecks current membership and rate limits", async () => {
    f.rate.mockResolvedValue(false); expect((await inventoryTelegramHttp(request(), "test")).status).toBe(429);
    f.rate.mockResolvedValue(true); f.lookup.mockResolvedValue(null); expect((await inventoryTelegramHttp(request(), "test")).status).toBe(404);
  });
});
