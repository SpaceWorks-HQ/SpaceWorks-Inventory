import type { SpaceRole } from "@prisma/client";

/**
 * Pure role and capability rules (safe to import in client components and
 * unit tests). Server code checks these after `requireSpace` resolved the
 * membership from the database; UI visibility is never authorization.
 *
 * OWNER > ADMIN > MANAGER > STAFF > MEMBER. The full matrix is documented in
 * docs/RBAC.md and enforced by tests/unit/roles.test.ts.
 */
export const SPACE_ROLES: readonly SpaceRole[] = ["OWNER", "ADMIN", "MANAGER", "STAFF", "MEMBER"] as const;

const roleRank: Record<SpaceRole, number> = { MEMBER: 0, STAFF: 1, MANAGER: 2, ADMIN: 3, OWNER: 4 };

export function hasRoleAtLeast(role: SpaceRole, min: SpaceRole): boolean {
  return roleRank[role] >= roleRank[min];
}

export function roleLabel(role: SpaceRole): string {
  return { OWNER: "Owner", ADMIN: "Admin", MANAGER: "Inventory manager", STAFF: "Staff", MEMBER: "Member" }[role];
}

export function roleDescription(role: SpaceRole): string {
  return {
    OWNER: "Everything, plus deleting the space and transferring ownership.",
    ADMIN: "Members, settings, API keys, webhooks and the audit log.",
    MANAGER: "Catalogue, locations, adjustments, approvals, imports and reports.",
    STAFF: "Issue and return loans, counts, dispatch and receive transfers.",
    MEMBER: "Browse the catalogue, borrow and return their own loans.",
  }[role];
}

export function isSpaceRole(value: unknown): value is SpaceRole {
  return typeof value === "string" && (SPACE_ROLES as readonly string[]).includes(value);
}

/** Minimal shape the capability helpers need (a Membership row or a DTO). */
export type RoleHolder = { role: SpaceRole } | null | undefined;

const atLeast = (m: RoleHolder, min: SpaceRole) => m != null && hasRoleAtLeast(m.role, min);

// ───────────── Members (borrowers) ─────────────
/** Browse the catalogue and request loans (access status is checked separately). */
export const canBorrow = (m: RoleHolder) => atLeast(m, "MEMBER");

// ───────────── Desk staff ─────────────
/** Stock levels, locations, assets and every loan in the space. */
export const canViewStock = (m: RoleHolder) => atLeast(m, "STAFF");
/** Approve or reject member loan requests. */
export const canApproveLoans = (m: RoleHolder) => atLeast(m, "STAFF");
/** Issue and receive returns (QR scan, photo evidence and remarks). */
export const canIssueLoans = (m: RoleHolder) => atLeast(m, "STAFF");
/** Count stock during a cycle count. */
export const canCountStock = (m: RoleHolder) => atLeast(m, "STAFF");
/** Request transfers and dispatch or receive them. */
export const canRequestTransfers = (m: RoleHolder) => atLeast(m, "STAFF");
export const canHandleTransfers = (m: RoleHolder) => atLeast(m, "STAFF");
/** Print QR labels. */
export const canPrintLabels = (m: RoleHolder) => atLeast(m, "STAFF");

// ───────────── Inventory managers ─────────────
/** Items, categories, units, images and assets. */
export const canManageCatalogue = (m: RoleHolder) => atLeast(m, "MANAGER");
/** The building → room → shelf/bin hierarchy. */
export const canManageLocations = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Adjust stock with a reason, receive stock and write off. */
export const canAdjustStock = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Start cycle counts and post their variances. */
export const canManageCounts = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Approve or reject transfers out of the space. */
export const canApproveTransfers = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Resolve lost or damaged loans and set a member's borrowing access. */
export const canResolveIncidents = (m: RoleHolder) => atLeast(m, "MANAGER");
export const canSetMemberAccess = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Reports, valuation and CSV/XLSX exports. */
export const canViewReports = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Bulk CSV/XLSX import and sample data. */
export const canImport = (m: RoleHolder) => atLeast(m, "MANAGER");
/** Inventory-manager settings: thresholds, transfer approvals, labels, count schedules. */
export const canManageInventorySettings = (m: RoleHolder) => atLeast(m, "MANAGER");

// ───────────── Admins and owners ─────────────
/** Invite, change roles, suspend and remove members. */
export const canManageMembers = (m: RoleHolder) => atLeast(m, "ADMIN");
export const canManageApiKeys = (m: RoleHolder) => atLeast(m, "ADMIN");
export const canManageWebhooks = (m: RoleHolder) => atLeast(m, "ADMIN");
export const canViewAuditLog = (m: RoleHolder) => atLeast(m, "ADMIN");
/** Space-manager settings: general, lending policy, eligibility, evidence, fees, payments, notifications, branding. */
export const canManageSpace = (m: RoleHolder) => atLeast(m, "ADMIN");
/** Lending policy and fees are space-manager settings. */
export const canManageLending = canManageSpace;
/** Payment providers and refunds. */
export const canManagePayments = canManageSpace;
/** Record offline payments, waive fees and refund deposits at the desk. */
export const canTakePayments = (m: RoleHolder) => atLeast(m, "STAFF");
/** Delete the space or transfer ownership. */
export const canDeleteSpace = (m: RoleHolder) => atLeast(m, "OWNER");
export const canTransferOwnership = (m: RoleHolder) => atLeast(m, "OWNER");

/**
 * Which roles an actor may assign. Only owners create owners or admins;
 * admins assign every role below admin.
 */
export function assignableRoles(actor: RoleHolder): SpaceRole[] {
  if (atLeast(actor, "OWNER")) return ["OWNER", "ADMIN", "MANAGER", "STAFF", "MEMBER"];
  if (atLeast(actor, "ADMIN")) return ["MANAGER", "STAFF", "MEMBER"];
  return [];
}

/** Can `actor` change or remove a member who currently has `targetRole`? */
export function canActOnMember(actor: RoleHolder, targetRole: SpaceRole): boolean {
  if (!canManageMembers(actor)) return false;
  if (actor!.role === "OWNER") return true;
  // Admins manage everyone below admin, never other admins or owners.
  return !hasRoleAtLeast(targetRole, "ADMIN");
}

/** One row per capability for the RBAC matrix page and docs. */
export const ROLE_MATRIX: readonly { capability: string; check: (m: RoleHolder) => boolean }[] = [
  { capability: "Browse the catalogue and request loans", check: canBorrow },
  { capability: "View stock, locations and every loan", check: canViewStock },
  { capability: "Approve loan requests", check: canApproveLoans },
  { capability: "Issue and receive returns", check: canIssueLoans },
  { capability: "Count stock", check: canCountStock },
  { capability: "Request, dispatch and receive transfers", check: canHandleTransfers },
  { capability: "Print QR labels", check: canPrintLabels },
  { capability: "Edit the catalogue and assets", check: canManageCatalogue },
  { capability: "Edit locations", check: canManageLocations },
  { capability: "Adjust and receive stock", check: canAdjustStock },
  { capability: "Start and post cycle counts", check: canManageCounts },
  { capability: "Approve transfers", check: canApproveTransfers },
  { capability: "Resolve lost or damaged items, set member access", check: canResolveIncidents },
  { capability: "Reports, valuation and exports", check: canViewReports },
  { capability: "Bulk import and sample data", check: canImport },
  { capability: "Inventory settings (thresholds, labels, transfer approvals, count schedules)", check: canManageInventorySettings },
  { capability: "Take payments, waive fees, return deposits", check: canTakePayments },
  { capability: "Lending policy, fees and payment providers", check: canManageLending },
  { capability: "Members and invitations", check: canManageMembers },
  { capability: "API keys and webhooks", check: canManageApiKeys },
  { capability: "Audit log", check: canViewAuditLog },
  { capability: "Space settings", check: canManageSpace },
  { capability: "Delete the space or transfer ownership", check: canDeleteSpace },
];
