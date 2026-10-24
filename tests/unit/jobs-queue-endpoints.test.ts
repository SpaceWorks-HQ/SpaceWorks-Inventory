import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/queue/enqueue", () => ({ enqueueDueOutbox: vi.fn(async () => ({ enqueued: 2 })) }));
import { POST } from "@/app/api/internal/outbox/route";
import { enqueueDueOutbox } from "@/lib/queue/enqueue";
const secret = "fixture-outbox-secret-with-at-least-32-characters";
const call = (authorization?: string) => POST(new Request("http://localhost/api/internal/outbox", { method: "POST", headers: authorization ? { authorization } : {} }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("outbox enqueue endpoint", () => {
  it("denies unauthenticated work before accessing Redis", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    expect((await call()).status).toBe(404);
    expect((await call("Bearer wrong")).status).toBe(404);
    expect(enqueueDueOutbox).not.toHaveBeenCalled();
  });
  it("enqueues after bearer validation without running delivery inline", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    const response = await call(`Bearer ${secret}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ ok: true, enqueued: 2 });
    expect(enqueueDueOutbox).toHaveBeenCalledTimes(1);
  });
  it("returns a safe retryable error when Redis is unavailable", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    vi.mocked(enqueueDueOutbox).mockRejectedValueOnce(new Error("private Redis connection"));
    const response = await call(`Bearer ${secret}`);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private Redis");
  });
});

vi.mock("@/lib/outboxWorker", () => ({ runOutboxScheduler: vi.fn(async () => ({ sent: 3, failed: 0, purged: {}, scheduled: { ran: 5, failed: [] } })) }));
describe("inline run for hosts without a worker", () => {
  it("delivers and runs the periodic jobs in-process once the secret matches", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    const { runOutboxScheduler } = await import("@/lib/outboxWorker");
    const denied = await POST(new Request("http://localhost/api/internal/outbox?run=inline", { method: "POST" }));
    expect(denied.status).toBe(404);
    const response = await POST(new Request("http://localhost/api/internal/outbox?run=inline", { method: "POST", headers: { authorization: `Bearer ${secret}` } }));
    expect(await response.json()).toEqual({ ok: true, sent: 3, failed: 0, jobsFailed: 0 });
    expect(runOutboxScheduler).toHaveBeenCalledTimes(1);
    expect(enqueueDueOutbox).not.toHaveBeenCalled();
  });
});
