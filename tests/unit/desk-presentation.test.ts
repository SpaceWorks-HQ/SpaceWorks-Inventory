import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepIndicator } from "@/components/desk/StepIndicator";
import { varianceLabel } from "@/lib/desk/format";
import { canOpenStep, DONE_COPY, doneKindOf, evidenceHint, reachableStep, withDone } from "@/lib/desk/stepper";

const TITLES = ["Scan", "Check the lines", "Photos and remarks"];
const items = (html: string) => html.split("<li").slice(1);

describe("desk stepper logic", () => {
  it("opens steps only up to the first one that isn't ready", () => {
    expect(reachableStep([false, false, false])).toBe(0);
    expect(reachableStep([true, false, true])).toBe(1);
    expect(reachableStep([true, true, true])).toBe(2);
    expect(canOpenStep([true, false, false], 1)).toBe(true);
    expect(canOpenStep([true, false, false], 2)).toBe(false);
    expect(canOpenStep([true, true, true], 3)).toBe(false);
    expect(canOpenStep([true], -1)).toBe(false);
  });

  it("accepts only known completion kinds, and only those a page allows", () => {
    expect(doneKindOf("issue")).toBe("issue");
    expect(doneKindOf(["dispatch", "x"])).toBe("dispatch");
    expect(doneKindOf("issue", ["dispatch", "receive"])).toBeNull();
    expect(doneKindOf("<script>")).toBeNull();
    expect(doneKindOf(undefined)).toBeNull();
    expect(withDone("/s/a/loans/l1", "return")).toBe("/s/a/loans/l1?done=return");
    for (const copy of Object.values(DONE_COPY)) expect(copy.steps).toHaveLength(3);
  });

  it("words the evidence hint for the photos and remarks a space requires", () => {
    expect(evidenceHint(0, false)).toBe("Add at least 1 photo.");
    expect(evidenceHint(2, true)).toBe("Add at least 2 photos and the remarks.");
  });
});

describe("step indicator", () => {
  it("marks the step on screen as current, earlier steps done and ends with Done", () => {
    const steps = items(renderToStaticMarkup(StepIndicator({ titles: TITLES, current: 1 })));
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain(", done");
    expect(steps[1]).toContain('aria-current="step"');
    expect(steps[2]).not.toContain("aria-current");
    expect(steps[3]).toContain("Done");
  });

  it("offers earlier and reachable steps as buttons, never the current or later ones", () => {
    const html = renderToStaticMarkup(StepIndicator({ titles: TITLES, current: 1, reachable: 2, onSelect: () => undefined }));
    const steps = items(html);
    expect(steps[0]).toContain("<button");
    expect(steps[1]).not.toContain("<button");
    expect(steps[2]).toContain("<button");
    expect(steps[3]).not.toContain("<button");
  });

  it("shows every step done once the flow is finished", () => {
    const steps = items(renderToStaticMarkup(StepIndicator({ titles: TITLES, current: 3, finished: true, onSelect: () => undefined })));
    expect(steps.slice(0, 3).every((step) => step.includes(", done"))).toBe(true);
    expect(steps[3]).toContain('aria-current="step"');
    expect(steps.join("")).not.toContain("<button");
  });
});

describe("count variance words", () => {
  it.each([
    [-2, undefined, "Short by 2"],
    [3, undefined, "Over by 3"],
    [0, "units", "Matches"],
    [-2, "units", "Short by 2 units"],
    [3, "units", "Over by 3 units"],
  ] as const)("labels %s with %s", (value, unit, expected) => {
    expect(varianceLabel(value, unit)).toBe(expected);
  });
});

describe("self-checkout switched off", () => {
  it("explains lending first, then self-checkout, and is silent when it is on", async () => {
    const { selfCheckoutOff } = await import("@/lib/desk/selfCheckoutOff");
    expect(selfCheckoutOff({ lendingEnabled: false, selfCheckoutEnabled: true })).toMatchObject({ title: "Lending is switched off", catalogue: false });
    expect(selfCheckoutOff({ lendingEnabled: true, selfCheckoutEnabled: false })).toMatchObject({ title: "Self-checkout is switched off", catalogue: true });
    expect(selfCheckoutOff({ lendingEnabled: true, selfCheckoutEnabled: true })).toBeNull();
  });
});

describe("completion card guard", () => {
  it("shows the card only when the record reached the state the flow leads to", async () => {
    const { doneFor } = await import("@/lib/desk/stepper");
    expect(doneFor("issue", ["issue", "return"], "ISSUED")).toBe("issue");
    expect(doneFor("issue", ["issue", "return"], "APPROVED")).toBeNull();
    expect(doneFor("return", ["issue", "return"], "PARTIALLY_RETURNED")).toBe("return");
    expect(doneFor("dispatch", ["issue", "return"], "DISPATCHED")).toBeNull();
    expect(doneFor("dispatch", ["dispatch", "receive"], "APPROVED")).toBeNull();
    expect(doneFor("receive", ["dispatch", "receive"], "RECEIVED")).toBe("receive");
  });
});
