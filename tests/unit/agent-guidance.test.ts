import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent guidance", () => {
  it("keeps CLAUDE.md byte-identical to AGENTS.md", () => {
    expect(readFileSync("CLAUDE.md")).toEqual(readFileSync("AGENTS.md"));
  });
});
