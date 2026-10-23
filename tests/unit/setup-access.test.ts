import { describe, expect, it } from "vitest";
import { publicAvailability, publicCatalogueVisible, qrLandingDecision, type QrTarget, type QrViewer } from "@/lib/setup/publicAccess";

const space = (overrides: Partial<QrTarget["space"]> = {}): QrTarget["space"] => ({ slug: "tinker", publicCatalogue: false, archivedAt: null, lendingEnabled: true, ...overrides });
const target = (overrides: Partial<QrTarget> = {}): QrTarget => ({ kind: "item", id: "item1", itemId: "item1", space: space(), lendable: true, ...overrides });
const viewer = (overrides: Partial<QrViewer> = {}): QrViewer => ({ signedIn: true, role: null, ownLoanId: null, ...overrides });

describe("public catalogue visibility", () => {
  it("is visible only for live spaces that publish it", () => {
    expect(publicCatalogueVisible(null)).toBe(false);
    expect(publicCatalogueVisible({ publicCatalogue: false, archivedAt: null })).toBe(false);
    expect(publicCatalogueVisible({ publicCatalogue: true, archivedAt: new Date() })).toBe(false);
    expect(publicCatalogueVisible({ publicCatalogue: true, archivedAt: null })).toBe(true);
  });

  it("uses words, never counts", () => {
    expect(publicAvailability(3, 0)).toBe("Available");
    expect(publicAvailability(0, 2)).toBe("On loan");
    expect(publicAvailability(0, 0)).toBe("Out of stock");
  });
});

describe("QR landing", () => {
  it("sends staff to the record page for every kind of code", () => {
    const staff = viewer({ role: "STAFF" });
    expect(qrLandingDecision(target(), staff)).toEqual({ type: "redirect", url: "/s/tinker/items/item1" });
    expect(qrLandingDecision(target({ kind: "asset", id: "a1" }), staff)).toEqual({ type: "redirect", url: "/s/tinker/assets/a1" });
    expect(qrLandingDecision(target({ kind: "location", id: "l1", itemId: null }), viewer({ role: "OWNER" }))).toEqual({ type: "redirect", url: "/s/tinker/stock?location=l1" });
    expect(qrLandingDecision(target({ kind: "kit", id: "k1", itemId: null }), staff)).toEqual({ type: "redirect", url: "/s/tinker/kits" });
    expect(qrLandingDecision(target({ kind: "container", id: "c1", itemId: null }), staff)).toEqual({ type: "redirect", url: "/s/tinker/kits" });
  });

  it("sends members to their own loan, else the catalogue item, else the space home", () => {
    const member = viewer({ role: "MEMBER" });
    expect(qrLandingDecision(target(), { ...member, ownLoanId: "loan9" })).toEqual({ type: "redirect", url: "/s/tinker/my-loans/loan9" });
    expect(qrLandingDecision(target(), member)).toEqual({ type: "redirect", url: "/s/tinker/catalogue?item=item1" });
    expect(qrLandingDecision(target({ lendable: false }), member)).toEqual({ type: "redirect", url: "/s/tinker" });
    expect(qrLandingDecision(target({ space: space({ lendingEnabled: false }) }), member)).toEqual({ type: "redirect", url: "/s/tinker" });
  });

  it("shows non-members the public entry only when the space publishes the item", () => {
    const outsider = viewer();
    const published = target({ space: space({ publicCatalogue: true }) });
    expect(qrLandingDecision(published, outsider)).toEqual({ type: "redirect", url: "/c/tinker?item=item1" });
    expect(qrLandingDecision(published, viewer({ signedIn: false }))).toEqual({ type: "redirect", url: "/c/tinker?item=item1" });
    expect(qrLandingDecision({ ...published, lendable: false }, outsider)).toEqual({ type: "neutral", signedIn: true });
    expect(qrLandingDecision(target({ kind: "location", itemId: null, space: space({ publicCatalogue: true }) }), outsider)).toEqual({ type: "neutral", signedIn: true });
  });

  it("answers the same neutral page for private, archived and unknown codes", () => {
    const signedOut = viewer({ signedIn: false });
    const unknown = qrLandingDecision(null, signedOut);
    expect(qrLandingDecision(target(), signedOut)).toEqual(unknown);
    expect(qrLandingDecision(target({ space: space({ publicCatalogue: true, archivedAt: new Date() }) }), signedOut)).toEqual(unknown);
    expect(qrLandingDecision(target({ space: space({ archivedAt: new Date() }) }), viewer({ role: "OWNER" }))).toEqual({ type: "neutral", signedIn: true });
    expect(unknown).toEqual({ type: "neutral", signedIn: false });
  });
});
