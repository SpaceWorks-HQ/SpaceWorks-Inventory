import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoodTile } from "@/components/brand/MoodTile";
import { PatchInBin } from "@/components/brand/PatchInBin";
import { NotFoundPet } from "@/components/feedback/NotFoundPet";
import { HandoverDone } from "@/components/desk/HandoverDone";
import { Skeleton } from "@/components/ui/skeleton";
import { centreOf, FADE_MS, REVEAL_DURATION_MS, REVEAL_FEATHER, revealOrigin, revealPlan, revealRadius } from "@/lib/colorModeReveal";
import { perfectCount, showsEmptyBin, trotsHome } from "@/lib/desk/eggs";
import { PET_EDGE, petMaxX, petStart, petStride, petTarget } from "@/lib/patch/pet";

const root = process.cwd();
const patchCss = readFileSync(path.join(root, "app", "styles", "patch.css"), "utf8");
const elementsCss = readFileSync(path.join(root, "app", "styles", "global-elements.css"), "utf8");
const viewport = { width: 1200, height: 800 };

describe("colour-mode reveal", () => {
  it("is instant under reduced motion, a fade without View Transitions, and feathered where masks allow", () => {
    expect(revealPlan({ reducedMotion: true, viewTransitions: true, featheredMask: true })).toBe("instant");
    expect(revealPlan({ reducedMotion: false, viewTransitions: false, featheredMask: true })).toBe("fade");
    expect(revealPlan({ reducedMotion: false, viewTransitions: true, featheredMask: false })).toBe("reveal");
    expect(revealPlan({ reducedMotion: false, viewTransitions: true, featheredMask: true })).toBe("reveal-soft");
  });

  it("starts at the pressed control, else the top-right corner, always inside the window", () => {
    expect(revealOrigin({ x: 100, y: 50 }, viewport)).toEqual({ x: 100, y: 50 });
    expect(revealOrigin(undefined, viewport)).toEqual({ x: 1160, y: 32 });
    expect(revealOrigin({ x: -20, y: 9_999 }, viewport)).toEqual({ x: 0, y: 800 });
    expect(centreOf({ left: 10, top: 20, width: 44, height: 44 })).toEqual({ x: 32, y: 42 });
  });

  it("grows far enough to cover the farthest corner plus the soft edge", () => {
    expect(revealRadius({ x: 0, y: 0 }, viewport)).toBeCloseTo(Math.hypot(1200, 800) + REVEAL_FEATHER);
    expect(revealRadius({ x: 600, y: 400 }, viewport, 0)).toBeCloseTo(Math.hypot(600, 400));
    expect(revealRadius({ x: 1100, y: 100 }, viewport, 0)).toBeCloseTo(Math.hypot(1100, 700));
  });

  it("uses the Events timings and the repo's own sw- names", () => {
    expect(REVEAL_DURATION_MS).toBe(720);
    expect(FADE_MS).toBe(420);
    for (const name of ["@property --sw-reveal", ".sw-theme-reveal-soft::view-transition-new(root)", ".sw-theme-fade", "transition-duration: 420ms", ".sw-mode-icon"]) expect(elementsCss).toContain(name);
    expect(elementsCss).not.toMatch(/yy-theme|yy-reveal|yy-mode-icon/);
  });
});

describe("inventory easter eggs", () => {
  it("peeks out of the bin only for an empty shelf picked without a search", () => {
    expect(showsEmptyBin({ locationId: "loc", q: "" }, 0)).toBe(true);
    expect(showsEmptyBin({ locationId: "loc", q: " drill " }, 0)).toBe(false);
    expect(showsEmptyBin({ locationId: "", q: "" }, 0)).toBe(false);
    expect(showsEmptyBin({ locationId: "loc", q: "" }, 3)).toBe(false);
  });

  it("sneezes only for a posted count where every counted line matched", () => {
    const lines = [{ countedQty: 4, variance: 0 }, { countedQty: null, variance: null }];
    expect(perfectCount({ status: "POSTED", lines })).toBe(true);
    expect(perfectCount({ status: "SUBMITTED", lines })).toBe(false);
    expect(perfectCount({ status: "POSTED", lines: [{ countedQty: 4, variance: -1 }] })).toBe(false);
    expect(perfectCount({ status: "POSTED", lines: [{ countedQty: null, variance: null }] })).toBe(false);
  });

  it("trots home only when a return closes the whole loan", () => {
    expect(trotsHome("return", "RETURNED")).toBe(true);
    expect(trotsHome("self-return", "RETURNED")).toBe(true);
    expect(trotsHome("return", "PARTIALLY_RETURNED")).toBe(false);
    expect(trotsHome("issue", "RETURNED")).toBe(false);
    const card = renderToStaticMarkup(createElement(HandoverDone, { kind: "return", dismissHref: "/x", homeAgain: true }));
    expect(card).toContain('data-egg="home-again"');
    expect(card).toContain('data-patch="walk"');
    expect(renderToStaticMarkup(createElement(HandoverDone, { kind: "return", dismissHref: "/x" }))).not.toContain("data-egg");
  });

  it("keeps every egg decorative", () => {
    expect(renderToStaticMarkup(createElement(PatchInBin))).toMatch(/^<span aria-hidden="true"[^>]*data-egg="empty-bin"/);
    const pet = renderToStaticMarkup(createElement(NotFoundPet));
    expect(pet).toMatch(/^<div aria-hidden="true" class="pointer-events-none fixed inset-0/);
    expect(renderToStaticMarkup(createElement(MoodTile, { mood: "happy" }))).toContain("sw-wiggle");
    expect(renderToStaticMarkup(createElement(Skeleton, {}))).toContain('aria-hidden="true"');
  });
});

describe("404 pet and motion CSS", () => {
  it("ships the walk sheets the CSS draws from", () => {
    const urls = [...patchCss.matchAll(/url\("(\/brand\/patch\/[^"]+)"\)/g)].map(([, url]) => url!);
    expect(new Set(urls)).toEqual(new Set(["/brand/patch/patch-walk-right.webp", "/brand/patch/patch-walk-left.webp"]));
    for (const url of urls) expect(existsSync(path.join(root, "public", url)), url).toBe(true);
  });

  it("stills the pet, its trails, the peek and skeletons under reduced motion", () => {
    const reduced = patchCss.slice(patchCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.sw-pet,\s*\.sw-pet-sprite,\s*\.sw-peek > \*,\s*\.sw-skeleton \{ animation: none !important; \}/);
    expect(reduced).toMatch(/\.sw-pet-zzz,\s*\.sw-pet-heart,\s*\.sw-pet-paw \{ display: none; \}/);
    expect(patchCss).toMatch(/@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\) \{\s*\.sw-wiggle-host:hover \.sw-wiggle/);
  });

  it("sits still near the right edge, facing in, under reduced motion", () => {
    expect(petStart(true, 1000, 88)).toEqual({ x: petMaxX(1000, 88) - 8, facing: "left", state: "sit" });
    expect(petStart(false, 1000, 88)).toEqual({ x: 180, facing: "right", state: "sit" });
  });

  it("keeps Patch inside the window and runs only for far targets", () => {
    expect(petTarget(-50, 1000, 88)).toBe(PET_EDGE);
    expect(petTarget(5000, 1000, 88)).toBe(petMaxX(1000, 88));
    expect(petStride(1, 1)).toEqual({ state: "sit", move: 0 });
    expect(petStride(300, 1).state).toBe("run");
    expect(petStride(100, 1).state).toBe("walk");
    expect(petStride(3, 1).move).toBeLessThanOrEqual(3);
  });
});
