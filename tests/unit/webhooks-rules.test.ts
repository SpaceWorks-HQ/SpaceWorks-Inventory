import { describe, expect, it } from "vitest";
import { endpointInputSchema, endpointState, ENDPOINT_STATE_LABEL, eventWords, urlHost } from "@/lib/webhooks/rules";

describe("webhook endpoint rules", () => {
  it("collapses a subscription that includes everything to the wildcard", () => {
    expect(endpointInputSchema.parse({ url: "https://example.org/h", events: ["loan.issued", "*"] }).events).toEqual(["*"]);
    expect(endpointInputSchema.parse({ url: "https://example.org/h", events: ["loan.issued", "loan.issued", "stock.low"] }).events).toEqual(["loan.issued", "stock.low"]);
  });

  it("refuses unknown events and empty subscriptions", () => {
    expect(endpointInputSchema.safeParse({ url: "https://example.org/h", events: ["loan.exploded"] }).success).toBe(false);
    expect(endpointInputSchema.safeParse({ url: "https://example.org/h", events: [] }).success).toBe(false);
  });

  it("turns a blank description into null", () => {
    expect(endpointInputSchema.parse({ url: "https://example.org/h", description: "  ", events: ["*"] }).description).toBeNull();
  });

  it("reads the endpoint state with a word for each", () => {
    expect(endpointState({ enabled: true, disabledAt: null })).toBe("enabled");
    expect(endpointState({ enabled: false, disabledAt: null })).toBe("off");
    expect(endpointState({ enabled: true, disabledAt: new Date() })).toBe("tripped");
    expect(ENDPOINT_STATE_LABEL.tripped).toBe("Switched off after failures");
  });

  it("lists event labels in catalogue order, or all events", () => {
    expect(eventWords(["*"])).toEqual(["All events"]);
    expect(eventWords(["loan.issued", "item.created"])).toEqual(["Item created", "Loan issued"]);
  });

  it("keeps only the host of a URL", () => {
    expect(urlHost("https://hooks.example.org:8443/a/b?token=secret")).toBe("hooks.example.org:8443");
    expect(urlHost("not a url")).toBe("");
  });
});
