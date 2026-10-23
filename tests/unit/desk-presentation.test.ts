import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StepHeading } from "@/components/desk/StepHeading";
import { varianceLabel } from "@/lib/desk/format";

function headings(completed: boolean[]) {
  return ["Scan", "Check the lines", "Photos and remarks"].map((children, index) =>
    renderToStaticMarkup(StepHeading({ step: index + 1, completed, children })),
  );
}

describe("desk step progress", () => {
  it("marks only the first unmet step as current, including when a later step is ready", () => {
    const steps = headings([false, false, true]);
    expect(steps[0]).toContain('aria-current="step"');
    expect(steps[1]).not.toContain("aria-current");
    expect(steps[2]).not.toContain("aria-current");
    expect(steps[2]).toContain(". Done");
    expect(steps[0]).not.toContain(". Done");
  });

  it("moves current to the next unmet step and clears it when all are done", () => {
    const steps = headings([true, false, false]);
    expect(steps[0]).toContain(". Done");
    expect(steps[1]).toContain('aria-current="step"');
    expect(steps[2]).not.toContain("aria-current");
    for (const heading of headings([true, true, true])) {
      expect(heading).toContain(". Done");
      expect(heading).not.toContain("aria-current");
    }
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
