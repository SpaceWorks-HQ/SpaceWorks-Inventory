import { describe, expect, it } from "vitest";
import type { SpaceRole } from "@prisma/client";
import {
  assignableRoles,
  canAdjustStock,
  canApproveLoans,
  canApproveTransfers,
  canBorrow,
  canDeleteSpace,
  canIssueLoans,
  canManageApiKeys,
  canManageCatalogue,
  canManageInventorySettings,
  canManageLending,
  canManageMembers,
  canPayRepairs,
  canViewFinance,
  canTakePayments,
  canViewAuditLog,
  canViewReports,
  canViewStock,
  hasRoleAtLeast,
  ROLE_MATRIX,
  SPACE_ROLES,
} from "@/lib/roles";

const as = (role: SpaceRole) => ({ role });

describe("role ranks", () => {
  it("orders MANAGER > STAFF > MEMBER, plus a repairs-only TECHNICIAN, with no admin or owner role", () => {
    expect(SPACE_ROLES).toEqual(["MANAGER", "STAFF", "MEMBER", "TECHNICIAN"]);
    expect(hasRoleAtLeast("TECHNICIAN", "MEMBER")).toBe(false);
    expect(hasRoleAtLeast("MEMBER", "TECHNICIAN")).toBe(true);
    expect(hasRoleAtLeast("MANAGER", "STAFF")).toBe(true);
    expect(hasRoleAtLeast("STAFF", "MANAGER")).toBe(false);
    expect(hasRoleAtLeast("STAFF", "MEMBER")).toBe(true);
  });
});

describe("capability matrix", () => {
  const cases: Array<[string, (m: { role: SpaceRole }) => boolean, SpaceRole]> = [
    ["borrow", canBorrow, "MEMBER"],
    ["view stock", canViewStock, "STAFF"],
    ["approve loans", canApproveLoans, "STAFF"],
    ["issue loans", canIssueLoans, "STAFF"],
    ["take payments", canTakePayments, "STAFF"],
    ["edit catalogue", canManageCatalogue, "MANAGER"],
    ["adjust stock", canAdjustStock, "MANAGER"],
    ["approve transfers", canApproveTransfers, "MANAGER"],
    ["reports", canViewReports, "MANAGER"],
    ["inventory settings", canManageInventorySettings, "MANAGER"],
    ["lending policy", canManageLending, "MANAGER"],
    ["members", canManageMembers, "MANAGER"],
    ["api keys", canManageApiKeys, "MANAGER"],
    ["audit log", canViewAuditLog, "MANAGER"],
    ["delete space", canDeleteSpace, "MANAGER"],
  ];
  for (const [name, check, minimum] of cases) {
    it(`${name} needs ${minimum}`, () => {
      for (const role of SPACE_ROLES) expect(check(as(role))).toBe(hasRoleAtLeast(role, minimum));
    });
  }

  it("denies a missing membership everywhere", () => {
    for (const row of ROLE_MATRIX) expect(row.check(null)).toBe(false);
  });

  it("gives technicians only repair work and keeps money with managers", () => {
    expect(ROLE_MATRIX.filter((row) => row.check(as("TECHNICIAN"))).map((row) => row.capability)).toEqual(["Work on repairs sent to them"]);
    for (const role of ["STAFF", "MEMBER", "TECHNICIAN"] as const) {
      expect(canViewFinance(as(role))).toBe(false);
      expect(canPayRepairs(as(role))).toBe(false);
    }
    expect(canViewFinance(as("MANAGER"))).toBe(true);
  });

  it("gives inventory managers every capability and members only borrowing and reporting", () => {
    expect(ROLE_MATRIX.every((row) => row.check(as("MANAGER")))).toBe(true);
    expect(ROLE_MATRIX.some((row) => /owner/i.test(row.capability))).toBe(false);
    expect(ROLE_MATRIX.filter((row) => row.check(as("MEMBER"))).map((row) => row.capability)).toEqual(["Browse the catalogue and request loans", "Report a damaged or broken item"]);
  });
});

describe("member management", () => {
  it("lets inventory managers assign every role, other managers included", () => {
    expect(assignableRoles(as("MANAGER"))).toEqual(["MANAGER", "STAFF", "MEMBER", "TECHNICIAN"]);
    expect(assignableRoles(as("STAFF"))).toEqual([]);
    expect(assignableRoles(as("MEMBER"))).toEqual([]);
  });
});
