import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROLE_MATRIX, SPACE_ROLES, roleLabel } from "@/lib/roles";

describe("docs/RBAC.md", () => {
  it("shows the same matrix as lib/roles.ts", () => {
    const rows = ROLE_MATRIX.map((row) => `| ${row.capability} | ${SPACE_ROLES.map((role) => (row.check({ role }) ? "Yes" : "—")).join(" | ")} |`);
    const table = ["| Capability | " + SPACE_ROLES.map(roleLabel).join(" | ") + " |", "| --- |" + SPACE_ROLES.map(() => " :-: |").join(""), ...rows].join("\n");
    const doc = readFileSync("docs/RBAC.md", "utf8");
    const block = doc.split("<!-- BEGIN:role-matrix")[1]!.split("\n").slice(1).join("\n").split("<!-- END:role-matrix -->")[0]!.trim();
    expect(block).toBe(table);
  });
});
