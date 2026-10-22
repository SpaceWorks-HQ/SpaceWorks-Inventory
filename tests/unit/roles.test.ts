import { describe, expect, it } from "vitest";
import type { SpaceRole } from "@prisma/client";
import {
  assignableRoles,
  canActOnMember,
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
  it("orders OWNER > ADMIN > MANAGER > STAFF > MEMBER", () => {
    expect(SPACE_ROLES).toEqual(["OWNER", "ADMIN", "MANAGER", "STAFF", "MEMBER"]);
    expect(hasRoleAtLeast("MANAGER", "STAFF")).toBe(true);
    expect(hasRoleAtLeast("STAFF", "MANAGER")).toBe(false);
    expect(hasRoleAtLeast("OWNER", "ADMIN")).toBe(true);
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
    ["lending policy", canManageLending, "ADMIN"],
    ["members", canManageMembers, "ADMIN"],
    ["api keys", canManageApiKeys, "ADMIN"],
    ["audit log", canViewAuditLog, "ADMIN"],
    ["delete space", canDeleteSpace, "OWNER"],
  ];
  for (const [name, check, minimum] of cases) {
    it(`${name} needs ${minimum}`, () => {
      for (const role of SPACE_ROLES) expect(check(as(role))).toBe(hasRoleAtLeast(role, minimum));
    });
  }

  it("denies a missing membership everywhere", () => {
    for (const row of ROLE_MATRIX) expect(row.check(null)).toBe(false);
  });

  it("gives owners every capability and members only borrowing", () => {
    expect(ROLE_MATRIX.every((row) => row.check(as("OWNER")))).toBe(true);
    expect(ROLE_MATRIX.filter((row) => row.check(as("MEMBER"))).map((row) => row.capability)).toEqual(["Browse the catalogue and request loans"]);
  });
});

describe("member management", () => {
  it("lets owners assign every role and admins only roles below admin", () => {
    expect(assignableRoles(as("OWNER"))).toEqual(["OWNER", "ADMIN", "MANAGER", "STAFF", "MEMBER"]);
    expect(assignableRoles(as("ADMIN"))).toEqual(["MANAGER", "STAFF", "MEMBER"]);
    expect(assignableRoles(as("MANAGER"))).toEqual([]);
  });

  it("stops admins acting on other admins or owners", () => {
    expect(canActOnMember(as("ADMIN"), "MANAGER")).toBe(true);
    expect(canActOnMember(as("ADMIN"), "ADMIN")).toBe(false);
    expect(canActOnMember(as("ADMIN"), "OWNER")).toBe(false);
    expect(canActOnMember(as("OWNER"), "OWNER")).toBe(true);
    expect(canActOnMember(as("MANAGER"), "MEMBER")).toBe(false);
  });
});
