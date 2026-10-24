import type { SpaceRole } from "@prisma/client";
import { hasRoleAtLeast } from "@/lib/roles";

/**
 * The single navigation config for the space sidebar (text-only, grouped).
 * Every product area lives here once; pages still enforce their own access
 * with `requireSpace(slug, minRole)`. Hiding a link is not authorization.
 */
export type NavRequirement = "lending";

export type NavItemConfig = {
  key: string;
  label: string;
  /** Path below /s/<slug>; "" is the space home. */
  path: string;
  minRole: SpaceRole;
  /** Roles outside the ladder that also see it (technicians see Repairs). */
  alsoFor?: SpaceRole[];
  requires?: NavRequirement;
  /** Match only the exact path (default: the path and anything below it). */
  exact?: boolean;
};

export type NavGroupConfig = { key: string; label: string | null; items: NavItemConfig[] };

export const NAV_GROUPS: readonly NavGroupConfig[] = [
  {
    key: "home",
    label: null,
    items: [
      { key: "home", label: "Home", path: "", minRole: "MEMBER", exact: true },
      { key: "catalogue", label: "Borrow", path: "/catalogue", minRole: "MEMBER", requires: "lending" },
      { key: "my-loans", label: "My loans", path: "/my-loans", minRole: "MEMBER", requires: "lending" },
      { key: "scan", label: "Scan", path: "/scan", minRole: "STAFF" },
    ],
  },
  {
    key: "desk",
    label: "Desk",
    items: [
      { key: "loans", label: "Loans", path: "/loans", minRole: "STAFF", requires: "lending" },
      { key: "transfers", label: "Transfers", path: "/transfers", minRole: "STAFF" },
      { key: "counts", label: "Counts", path: "/counts", minRole: "STAFF" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    items: [
      { key: "items", label: "Items", path: "/items", minRole: "STAFF" },
      { key: "stock", label: "Stock", path: "/stock", minRole: "STAFF" },
      { key: "assets", label: "Assets", path: "/assets", minRole: "STAFF" },
      { key: "locations", label: "Locations", path: "/locations", minRole: "STAFF" },
      { key: "kits", label: "Kits & containers", path: "/kits", minRole: "STAFF" },
      { key: "repairs", label: "Repairs", path: "/repairs", minRole: "STAFF", alsoFor: ["TECHNICIAN"] },
      { key: "purchases", label: "To buy", path: "/purchases", minRole: "MANAGER" },
      { key: "reports", label: "Reports", path: "/reports", minRole: "MANAGER" },
      { key: "finance", label: "Finance", path: "/finance", minRole: "MANAGER" },
    ],
  },
  {
    key: "space",
    label: "Space",
    items: [
      { key: "members", label: "Members", path: "/members", minRole: "MANAGER" },
      { key: "technicians", label: "Technicians", path: "/repairs/technicians", minRole: "MANAGER" },
      { key: "inventory-settings", label: "Inventory settings", path: "/settings/inventory", minRole: "MANAGER" },
      { key: "settings", label: "Space settings", path: "/settings", minRole: "MANAGER" },
      { key: "audit", label: "Audit log", path: "/audit", minRole: "MANAGER" },
    ],
  },
];

export type NavContext = {
  role: SpaceRole;
  space: { lendingEnabled: boolean };
};

export type ResolvedNavItem = { key: string; label: string; href: string; exact: boolean };
export type ResolvedNavGroup = { key: string; label: string | null; items: ResolvedNavItem[] };

export function spaceBasePath(slug: string) {
  return `/s/${encodeURIComponent(slug)}`;
}

function allowed(item: NavItemConfig, context: NavContext) {
  if (!hasRoleAtLeast(context.role, item.minRole) && !item.alsoFor?.includes(context.role)) return false;
  if (item.requires === "lending") return context.space.lendingEnabled;
  return true;
}

/** Groups and links visible to a member, with hrefs for this space. Empty groups are dropped. */
export function navForMember(slug: string, context: NavContext): ResolvedNavGroup[] {
  const base = spaceBasePath(slug);
  return NAV_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    items: group.items
      .filter((item) => allowed(item, context))
      .map((item) => ({ key: item.key, label: item.label, href: `${base}${item.path}`, exact: Boolean(item.exact) })),
  })).filter((group) => group.items.length > 0);
}

/** Is `pathname` the active page for `item`? The longest matching href wins (see `activeNavKey`). */
export function navItemMatches(item: ResolvedNavItem, pathname: string) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Key of the single active item: the most specific match (so /settings/integrations beats /settings). */
export function activeNavKey(groups: ResolvedNavGroup[], pathname: string): string | null {
  let best: ResolvedNavItem | null = null;
  for (const item of groups.flatMap((group) => group.items)) {
    if (navItemMatches(item, pathname) && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key ?? null;
}
