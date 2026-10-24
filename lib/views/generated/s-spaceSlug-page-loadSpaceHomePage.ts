// Generated from app/s/[spaceSlug]/page.tsx; regenerate with npm run frontend:catalog.
import "server-only";
import { viewDto } from "@/lib/frontend/view";
import { redirect } from "next/navigation";
import { requireSpace } from "@/lib/permissions";
import { financeKpis } from "@/lib/finance/kpis";
import { canManageSpace, canViewFinance, canViewStock } from "@/lib/roles";
import { memberHome, staffHome } from "@/lib/setup/home";
function greeting(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hello, ${first}` : "Hello";
}
export async function loadSpaceHomePage({ params }: PageProps<"/s/[spaceSlug]">) {
const { spaceSlug } = await params;
const { space, user, membership } = await requireSpace(spaceSlug, "TECHNICIAN");
if (membership.role === "TECHNICIAN") redirect(`/s/${space.slug}/repairs`);
const isStaff = canViewStock(membership);
const staff = isStaff ? await staffHome({ id: space.id, timezone: space.timezone }) : null;
const member = isStaff ? null : await memberHome(space.id, user.id);
const money = canViewFinance(membership) ? await financeKpis({ id: space.id, timezone: space.timezone }) : null;
const currency = space.currency;
const needsSetup = space.setupCompletedAt === null && canManageSpace(membership);
const slug = space.slug;
const timezone = space.timezone;
const lendingEnabled = space.lendingEnabled;
const title = greeting(user.name);
const description = space.tagline ?? `Welcome to ${space.name}.`;
return viewDto({ space, staff, member, money, currency, needsSetup, slug, timezone, lendingEnabled, title, description } as const);
}
