import { describe, expect, it } from "vitest";
import { mentorTagMetadata } from "@/lib/agents/mentor";
import { OPERATION_DEFINITIONS } from "@/lib/agents/operations";

describe("inventory agent evidence and capabilities", () => {
  it("uses explicit catalogue tags without guessing capabilities from product names", () => {
    expect(mentorTagMetadata(["weather", "capability:temperature", "interface:i2c", "voltage:3.3v", "capability:"])).toEqual({ capabilities: ["temperature"], interfaces: ["i2c"], voltage: "3.3v" });
    expect(mentorTagMetadata(["DHT22", "greenhouse"])).toEqual({ capabilities: [], interfaces: [], voltage: undefined });
  });
  it("preserves manager-only stock and refuses to advertise unimplemented evidence bypasses", () => {
    expect(OPERATION_DEFINITIONS.filter(value => value.name.startsWith("stock.")).every(value => value.roles.length === 1 && value.roles[0] === "manager")).toBe(true);
    expect(OPERATION_DEFINITIONS.map(value => value.name)).not.toContain("inventory.consume");
    expect(OPERATION_DEFINITIONS.map(value => value.name)).not.toContain("lending.issue");
    expect(OPERATION_DEFINITIONS.map(value => value.name)).not.toContain("lending.return");
  });
});
