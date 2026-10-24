import { describe, expect, it } from "vitest";
import { auditActionWords, auditActorName, auditMetadataPairs, auditWhere, humaniseKey, parseAuditFilters } from "@/lib/reports/audit";

describe("audit filters", () => {
  it("keeps well-formed filters and drops the rest", () => {
    expect(parseAuditFilters({ action: "Loan.", actor: "user_1", target: "Membership", from: "2026-10-01", to: "2026-10-23", cursor: "abc" })).toEqual({
      action: "loan.", actorId: "user_1", targetType: "Membership", from: "2026-10-01", to: "2026-10-23", cursor: "abc",
    });
    expect(parseAuditFilters({ action: "loan'; drop", actor: "a b", target: "x.y", from: "1/10/2026", to: "", cursor: ["c1", "c2"] })).toEqual({
      action: null, actorId: null, targetType: null, from: null, to: null, cursor: "c1",
    });
  });

  it("builds a space-scoped query with an inclusive end day in the space time zone", () => {
    const where = auditWhere("space1", parseAuditFilters({ action: "member", from: "2026-10-01", to: "2026-10-01" }), "Asia/Kolkata");
    expect(where.spaceId).toBe("space1");
    expect(where.action).toEqual({ startsWith: "member." });
    expect(where.createdAt).toEqual({ gte: new Date("2026-09-30T18:30:00.000Z"), lt: new Date("2026-10-01T18:30:00.000Z") });
    expect(auditWhere("s", parseAuditFilters({ action: "loan.requested" }), "UTC").action).toEqual({ startsWith: "loan.requested" });
  });
});

describe("audit words", () => {
  it("names known actions in plain language and falls back for others", () => {
    expect(auditActionWords("settings.updated")).toBe("Changed settings");
    expect(auditActionWords("loan.requested")).toBe("Requested a loan");
    expect(auditActionWords("transfer.dispatched")).toBe("Transfer: dispatched");
    expect(auditActionWords("api_token.rotated_twice")).toBe("Api token: rotated twice");
  });

  it("humanises metadata keys", () => {
    expect(humaniseKey("expiresInDays")).toBe("Expires in days");
    expect(humaniseKey("from_status")).toBe("From status");
  });

  it("shows scalar metadata only, truncated", () => {
    const pairs = auditMetadataPairs({ section: "lending", automatic: true, count: 3, note: null, nested: { secret: "x" }, list: [1], long: "x".repeat(200) });
    expect(pairs).toEqual([
      { label: "Section", value: "lending" },
      { label: "Automatic", value: "Yes" },
      { label: "Count", value: "3" },
      { label: "Note", value: "None" },
      { label: "Long", value: `${"x".repeat(79)}…` },
    ]);
    expect(auditMetadataPairs(null)).toEqual([]);
    expect(auditMetadataPairs(["a"])).toEqual([]);
  });

  it("names the actor: API key, person or system", () => {
    expect(auditActorName({ actor: null, actorApiToken: { name: "Till" } })).toBe("API key Till");
    expect(auditActorName({ actor: { name: null, email: "a@b.test" }, actorApiToken: null })).toBe("a@b.test");
    expect(auditActorName({ actor: null, actorApiToken: null })).toBe("System");
  });
});
