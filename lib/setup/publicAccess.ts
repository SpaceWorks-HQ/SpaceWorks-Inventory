import type { SpaceRole } from "@prisma/client";
import { hasRoleAtLeast } from "@/lib/roles";

/**
 * Pure visibility rules for the public catalogue and the QR landing page.
 * A code never reveals which space owns it to someone who is not a member,
 * unless that space chose to publish the item in its public catalogue.
 */

export type PublicSpaceFlags = { publicCatalogue: boolean; archivedAt: Date | null; lendingEnabled?: boolean };

/** The public catalogue exists only for live spaces that switched it on. */
export function publicCatalogueVisible(space: PublicSpaceFlags | null | undefined): boolean {
  return Boolean(space && !space.archivedAt && space.publicCatalogue);
}

/** Only these words appear publicly; exact counts stay private. */
export type PublicAvailability = "Available" | "On loan" | "Out of stock";

export function publicAvailability(available: number, onLoan: number): PublicAvailability {
  if (available > 0) return "Available";
  return onLoan > 0 ? "On loan" : "Out of stock";
}

export type QrKindName = "item" | "asset" | "location" | "kit" | "container";

export type QrTarget = {
  kind: QrKindName;
  id: string;
  /** The catalogue item behind an item or asset code (null for locations, kits, containers). */
  itemId: string | null;
  space: { slug: string } & PublicSpaceFlags;
  /** Item (or the asset's item, or the kit) is lendable and not archived. */
  lendable: boolean;
};

export type QrViewer = {
  signedIn: boolean;
  /** Active role in the owning space, or null when not an active member. */
  role: SpaceRole | null;
  /** The viewer's own open loan holding this item or asset, if any. */
  ownLoanId: string | null;
};

export type QrDecision =
  | { type: "redirect"; url: string }
  /** Neutral page: "Sign in to see this item" (or "You don't have access" when signed in), identical for unknown codes. */
  | { type: "neutral"; signedIn: boolean };

function staffUrl(slug: string, target: QrTarget): string {
  const base = `/s/${slug}`;
  switch (target.kind) {
    case "item":
      return `${base}/items/${target.id}`;
    case "asset":
      return `${base}/assets/${target.id}`;
    case "location":
      // A shelf scan shows what is on that shelf (and inside it).
      return `${base}/stock?location=${target.id}`;
    case "kit":
    case "container":
      return `${base}/kits`;
  }
}

/** Where a scanned code takes this viewer. `target` is null for unknown codes. */
export function qrLandingDecision(target: QrTarget | null, viewer: QrViewer): QrDecision {
  const neutral: QrDecision = { type: "neutral", signedIn: viewer.signedIn };
  if (!target || target.space.archivedAt) return neutral;
  const slug = encodeURIComponent(target.space.slug);
  if (viewer.signedIn && viewer.role) {
    if (hasRoleAtLeast(viewer.role, "STAFF")) return { type: "redirect", url: staffUrl(slug, target) };
    if (viewer.ownLoanId) return { type: "redirect", url: `/s/${slug}/my-loans/${viewer.ownLoanId}` };
    if (target.lendable && target.itemId && target.space.lendingEnabled !== false) return { type: "redirect", url: `/s/${slug}/catalogue?item=${target.itemId}` };
    return { type: "redirect", url: `/s/${slug}` };
  }
  if (publicCatalogueVisible(target.space) && target.lendable && target.itemId) {
    return { type: "redirect", url: `/c/${slug}?item=${target.itemId}` };
  }
  return neutral;
}
