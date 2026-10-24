import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("@/lib/frontend/request", () => ({ backendHeaders: mocks.headers, backendUrl: (path: string) => new URL(path, "https://api.example.test") }));
import { proxyBackendApi, proxyBackendResource } from "@/lib/frontend/httpProxy";

beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://space.example.test"); vi.stubEnv("BACKEND_ORIGIN", "https://api.example.test"); mocks.headers.mockReset().mockResolvedValue(new Headers({ "x-swi-frontend-key": "test-peer" })); });

describe("frontend API proxy", () => {
  it("never gives browser calls access to private peer or operational endpoints", async () => {
    for (const path of ["frontend/view/private", "%66rontend/action/private", "%2566rontend/action/private", "FRONTEND/action/private", "internal/outbox", "health/db", "x%2f..%2ffrontend/view/private"]) {
      expect((await proxyBackendApi(new Request(`https://space.example.test/api/${path}`))).status).toBe(404);
    }
    expect(mocks.headers).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes before forwarding any cookies", async () => {
    const response = await proxyBackendApi(new Request("https://space.example.test/api/rsvp", { method: "POST", headers: { origin: "https://attacker.example.test", cookie: "session=value" } }));
    expect(response.status).toBe(404); expect(mocks.headers).not.toHaveBeenCalled();
  });
  it("preserves multiple host-only auth cookies and redirects to the frontend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: [["set-cookie", "csrf=one; Path=/; HttpOnly; Secure; SameSite=Lax"], ["set-cookie", "session=two; Path=/; HttpOnly; Secure; SameSite=Lax"], ["location", "https://api.example.test/account"]] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await proxyBackendApi(new Request("https://space.example.test/api/auth/session", { headers: { "x-forwarded-for": "spoofed", "x-swi-frontend-key": "spoofed" } }));
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(response.headers.get("location")).toBe("https://space.example.test/account");
      const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
      expect(forwarded.has("x-forwarded-for")).toBe(false); expect(forwarded.get("x-swi-frontend-key")).toBe("test-peer");
    } finally { vi.unstubAllGlobals(); }
  });
  it("forwards payment webhooks with their signatures and no cookies, without a browser Origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401, headers: { "www-authenticate": "Bearer realm=space-works" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const response = await proxyBackendApi(new Request("https://space.example.test/api/payments/stripe/abcdefghijklmnopqrstuvwx", { method: "POST", headers: { "stripe-signature": "t=1,v1=fixture", cookie: "session=value" }, body: "{}" }));
      expect(response.status).toBe(401);
      const forwarded = fetchMock.mock.calls[0][1].headers as Headers;
      expect(forwarded.get("stripe-signature")).toBe("t=1,v1=fixture");
      expect(forwarded.has("cookie")).toBe(false);
      expect(response.headers.get("www-authenticate")).toBe("Bearer realm=space-works");
    } finally { vi.unstubAllGlobals(); }
  });
  it("proxies only exact non-API resources and retains private-file CSP", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("file", { headers: { "content-security-policy": "sandbox" } }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect((await proxyBackendResource(new Request("https://space.example.test/s/makers/labels/print"))).headers.get("content-security-policy")).toBe("sandbox");
      expect((await proxyBackendResource(new Request("https://space.example.test/blog/makers/rssXxml"))).status).toBe(404);
      expect((await proxyBackendResource(new Request("https://space.example.test/admin"))).status).toBe(404);
    } finally { vi.unstubAllGlobals(); }
  });

});
